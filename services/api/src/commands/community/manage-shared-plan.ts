/**
 * Looking after a published plan (docs/api-contracts.md §4.16): the requester or an organiser
 * changes what it shows or takes it down, and any member makes or revokes an unlisted read-only
 * link. A link's token is returned once and only its hash is kept.
 */
import { createHash, randomBytes } from 'node:crypto';

import { appendDomainEvent } from '@cp/db';
import {
  buildLink,
  createPlanLinkPayloadSchema,
  DomainError,
  linkHostsFor,
  revokePlanLinkPayloadSchema,
  sharedPlanIdPayloadSchema,
  updateSharedPlanPayloadSchema,
  type CreatePlanLinkResult,
  type LinkEnvironment,
  type SharedPlanStateResult,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { requireTripMember } from '../../plan/access';
import { defineCommand } from '../_framework/define-command';
import {
  liveSharedPlanId,
  materialise,
  one,
  requireManager,
  sharedPlanById,
  unpublish,
} from './store';

export const updateSharedPlanCommand = defineCommand({
  name: 'update_shared_plan',
  v: 1,
  schema: updateSharedPlanPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const plan = await asSystemRole(tx, () => sharedPlanById(tx, payload.shared_plan_id));
    await requireTripMember(tx, plan.trip_id);
  },
  handle: (tx, payload, ctx): Promise<SharedPlanStateResult> =>
    asSystemRole(tx, async () => {
      const plan = await sharedPlanById(tx, payload.shared_plan_id, { lock: true });
      await requireManager(tx, plan, ctx.uid);
      if (plan.status === 'published') {
        await materialise(tx, plan, payload.toggles);
      } else if (plan.status === 'pending_consent') {
        await tx.query('UPDATE shared_plans SET toggles = $2 WHERE id = $1', [
          plan.id,
          JSON.stringify(payload.toggles),
        ]);
      } else {
        throw new DomainError('STATE_INVALID', { reason: 'not_published' });
      }
      await appendDomainEvent(tx, {
        type: 'shared_plan.updated',
        aggregateKind: 'trip',
        aggregateId: plan.trip_id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: plan.trip_id,
        crewId: plan.crew_id,
        payload: { shared_plan_id: plan.id, trip_id: plan.trip_id },
      });
      return { shared_plan_id: plan.id, status: plan.status };
    }),
});

export const unpublishSharedPlanCommand = defineCommand({
  name: 'unpublish_shared_plan',
  v: 1,
  schema: sharedPlanIdPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const plan = await asSystemRole(tx, () => sharedPlanById(tx, payload.shared_plan_id));
    await requireTripMember(tx, plan.trip_id);
  },
  handle: (tx, payload, ctx): Promise<SharedPlanStateResult> =>
    asSystemRole(tx, async () => {
      const plan = await sharedPlanById(tx, payload.shared_plan_id, { lock: true });
      await requireManager(tx, plan, ctx.uid);
      if (plan.status === 'unpublished' || plan.status === 'declined') {
        return { shared_plan_id: plan.id, status: plan.status };
      }
      await unpublish(tx, plan, 'crew', { kind: 'user', id: ctx.uid });
      return { shared_plan_id: plan.id, status: 'unpublished' };
    }),
});

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createPlanLinkCommand(linkEnv: LinkEnvironment) {
  return defineCommand({
    name: 'create_plan_link',
    v: 1,
    schema: createPlanLinkPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload) => {
      await requireTripMember(tx, payload.trip_id);
    },
    handle: (tx, payload, ctx): Promise<CreatePlanLinkResult> =>
      asSystemRole(tx, async () => {
        const token = randomBytes(18).toString('base64url');
        const sharedPlanId = await liveSharedPlanId(tx, payload.trip_id);
        const { rows } = await tx.query<{ id: string; crew_id: string }>(
          `INSERT INTO plan_links (trip_id, shared_plan_id, token_hash, created_by)
           SELECT $1, $2, $3, $4 RETURNING id,
                  (SELECT crew_id FROM trips WHERE id = $1) AS crew_id`,
          [payload.trip_id, sharedPlanId, hashToken(token), ctx.uid],
        );
        const row = one(rows);
        await appendDomainEvent(tx, {
          type: 'plan_link.created',
          aggregateKind: 'trip',
          aggregateId: payload.trip_id,
          actorKind: 'user',
          actorId: ctx.uid,
          tripId: payload.trip_id,
          crewId: row.crew_id,
          payload: { link_id: row.id, trip_id: payload.trip_id },
        });
        const [host] = linkHostsFor(linkEnv);
        return {
          link_id: row.id,
          token,
          url: buildLink({ kind: 'plan_share', token }, { host, channel: 'copy' }),
        };
      }),
  });
}

export const revokePlanLinkCommand = defineCommand({
  name: 'revoke_plan_link',
  v: 1,
  schema: revokePlanLinkPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const { rows } = await tx.query<{ trip_id: string }>(
      'SELECT trip_id FROM plan_links WHERE id = $1',
      [payload.link_id],
    );
    if (rows[0] === undefined) throw new DomainError('NOT_FOUND', { reason: 'link' });
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ trip_id: string; crew_id: string }>(
        `UPDATE plan_links l SET revoked_at = coalesce(l.revoked_at, now())
           FROM trips t WHERE l.id = $1 AND t.id = l.trip_id
         RETURNING l.trip_id, t.crew_id`,
        [payload.link_id],
      );
      const row = one(rows);
      await appendDomainEvent(tx, {
        type: 'plan_link.revoked',
        aggregateKind: 'trip',
        aggregateId: row.trip_id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: row.trip_id,
        crewId: row.crew_id,
        payload: { link_id: payload.link_id, trip_id: row.trip_id },
      });
      return { revoked: true as const };
    }),
});
