/**
 * `register_la_token` (docs/api-contracts.md §4.1): the phone hands over an ActivityKit token.
 * - `push_to_start`: one per (device, activity type); it rotates, and the newest wins. It carries
 *   the kinds the build draws (`la_kinds`), recorded on every token of the install.
 * - `update`: one activity's own token; it binds to the server's row for that activity (matched by
 *   the phone's `activity_id`, else by the pending row a push-to-start created for the same object),
 *   or records an activity the app started itself.
 * Only for the caller's own install. A replayed op returns the stored result (the command door
 * dedupes on `op_id`).
 */
import { appendDomainEvent } from '@cp/db';
import { registerLaTokenPayloadSchema, type RegisterLaTokenPayload } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireOwnDevice, tripOfObject } from './shared';

type UpdateToken = Extract<RegisterLaTokenPayload, { kind: 'update' }>;

async function bindUpdateToken(
  tx: pg.PoolClient,
  payload: UpdateToken,
  deviceId: string,
  uid: string,
): Promise<string> {
  const byOsId = await tx.query<{ id: string }>(
    `UPDATE device_activities
        SET activity_push_token = $3, token_env = $4,
            state = CASE WHEN state = 'pending' THEN 'active' ELSE state END
      WHERE device_id = $1 AND os_activity_id = $2 AND state IN ('pending', 'active', 'stale')
      RETURNING id`,
    [deviceId, payload.activity_id, payload.token, payload.apns_env],
  );
  if (byOsId.rows[0] !== undefined) return byOsId.rows[0].id;
  const byObject = await tx.query<{ id: string }>(
    `UPDATE device_activities
        SET os_activity_id = $4, activity_push_token = $5, token_env = $6, state = 'active'
      WHERE device_id = $1 AND kind = $2 AND ref_id = $3 AND state IN ('pending', 'active', 'stale')
        AND (os_activity_id IS NULL OR os_activity_id = $4)
      RETURNING id`,
    [
      deviceId,
      payload.activity_type,
      payload.ref_id,
      payload.activity_id,
      payload.token,
      payload.apns_env,
    ],
  );
  if (byObject.rows[0] !== undefined) return byObject.rows[0].id;
  const tripId = await tripOfObject(tx, payload.activity_type, payload.ref_id);
  const inserted = await tx.query<{ id: string }>(
    `INSERT INTO device_activities (device_id, user_id, trip_id, kind, ref_id, os_activity_id,
       activity_push_token, token_env, started_via, state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
     ON CONFLICT (device_id, kind, ref_id) WHERE state IN ('pending', 'active', 'stale')
     DO UPDATE SET os_activity_id = EXCLUDED.os_activity_id,
       activity_push_token = EXCLUDED.activity_push_token, token_env = EXCLUDED.token_env
     RETURNING id`,
    [
      deviceId,
      uid,
      tripId,
      payload.activity_type,
      payload.ref_id,
      payload.activity_id,
      payload.token,
      payload.apns_env,
      payload.started_via,
    ],
  );
  const row = inserted.rows[0];
  if (row === undefined) throw new Error('device_activities upsert returned no row');
  return row.id;
}

export const registerLaTokenCommand = defineCommand({
  name: 'register_la_token',
  v: 1,
  schema: registerLaTokenPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, _payload, ctx) => {
    await asSystemRole(tx, () => requireOwnDevice(tx, ctx.device.id, ctx.uid));
  },
  handle: async (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const deviceId = ctx.device.id;
      let activityRowId: string | null = null;
      if (payload.kind === 'push_to_start') {
        await tx.query(
          `INSERT INTO la_push_to_start_tokens (device_id, user_id, activity_type, token, env)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (device_id, activity_type) DO UPDATE
             SET token = EXCLUDED.token, env = EXCLUDED.env, user_id = EXCLUDED.user_id,
                 invalid_at = NULL, invalid_reason = NULL`,
          [deviceId, ctx.uid, payload.activity_type, payload.token, payload.apns_env],
        );
        // What this install's build draws, on every token it holds: a build that lists nothing
        // (older builds) only ever gets the baseline kinds push-started.
        await tx.query(
          `UPDATE la_push_to_start_tokens SET drawn = activity_type = ANY($2::text[])
            WHERE device_id = $1 AND drawn IS DISTINCT FROM (activity_type = ANY($2::text[]))`,
          [deviceId, payload.la_kinds ?? []],
        );
      } else {
        activityRowId = await bindUpdateToken(tx, payload, deviceId, ctx.uid);
      }
      await appendDomainEvent(tx, {
        type: 'la.token_registered',
        aggregateKind: 'device',
        aggregateId: deviceId,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: {
          user_id: ctx.uid,
          device_id: deviceId,
          activity_type: payload.activity_type,
          kind: payload.kind,
        },
      });
      return {
        activity_type: payload.activity_type,
        kind: payload.kind,
        activity_row_id: activityRowId,
      };
    }),
});
