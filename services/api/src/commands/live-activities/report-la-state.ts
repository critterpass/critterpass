/**
 * `report_la_state` (doc delta: new command): what happened to a Live Activity on the phone. The
 * app reports an activity it started (locally or at a scheduled start), one going stale, one that
 * ended, and one the user swiped away. A dismissal is remembered: the orchestrator does not start
 * that object's activity on that phone again.
 */
import { appendDomainEvent } from '@cp/db';
import { reportLaStatePayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireOwnDevice, tripOfObject } from './shared';

export const reportLaStateCommand = defineCommand({
  name: 'report_la_state',
  v: 1,
  schema: reportLaStatePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, _payload, ctx) => {
    await asSystemRole(tx, () => requireOwnDevice(tx, ctx.device.id, ctx.uid));
  },
  handle: async (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const deviceId = ctx.device.id;
      const closing = payload.state === 'ended' || payload.state === 'dismissed';
      // The phone's own activity id first (whatever state the server has for it), else the
      // live row a push-to-start opened for the same object.
      const { rows } = await tx.query<{ id: string; state: string }>(
        `SELECT id, state FROM device_activities
          WHERE device_id = $1
            AND (os_activity_id = $2
              OR (os_activity_id IS NULL AND kind = $3 AND ref_id = $4
                  AND state IN ('pending', 'active', 'stale')))
          ORDER BY (os_activity_id IS NOT DISTINCT FROM $2) DESC LIMIT 1`,
        [deviceId, payload.activity_id, payload.kind, payload.ref_id],
      );
      const live = rows[0];
      let changed = true;
      if (live !== undefined) {
        // A closed activity stays closed: a late "active" queued offline never revives it, and
        // the system clearing an activity that already ended is not the user dismissing it.
        const closed = live.state === 'ended' || live.state === 'dismissed';
        changed = !closed && live.state !== payload.state;
        if (changed)
          await tx.query(
            `UPDATE device_activities
              SET os_activity_id = $2, state = $3,
                  ended_at = CASE WHEN $4 THEN $5::timestamptz END,
                  end_reason = CASE WHEN $3 = 'dismissed' THEN 'user_dismissed'
                                    WHEN $3 = 'ended' THEN 'ended_on_device' END
            WHERE id = $1`,
            [live.id, payload.activity_id, payload.state, closing, ctx.clock.serverNow],
          );
      } else {
        const tripId = await tripOfObject(tx, payload.kind, payload.ref_id);
        await tx.query(
          `INSERT INTO device_activities (device_id, user_id, trip_id, kind, ref_id, os_activity_id,
             started_via, state, ended_at, end_reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                   CASE WHEN $9 THEN $10::timestamptz END,
                   CASE WHEN $8 = 'dismissed' THEN 'user_dismissed'
                        WHEN $8 = 'ended' THEN 'ended_on_device' END)
           ON CONFLICT DO NOTHING`,
          [
            deviceId,
            ctx.uid,
            tripId,
            payload.kind,
            payload.ref_id,
            payload.activity_id,
            payload.started_via,
            payload.state,
            closing,
            ctx.clock.serverNow,
          ],
        );
      }
      if (changed) {
        await appendDomainEvent(tx, {
          type: 'la.state_reported',
          aggregateKind: 'device',
          aggregateId: deviceId,
          actorKind: 'user',
          actorId: ctx.uid,
          payload: {
            user_id: ctx.uid,
            device_id: deviceId,
            activity_type: payload.kind,
            ref_id: payload.ref_id,
            state: payload.state,
          },
        });
      }
      return { state: payload.state, changed };
    }),
});
