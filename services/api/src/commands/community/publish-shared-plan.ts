/**
 * Publishing a crew plan (docs/api-contracts.md §4.16): any seat holder asks, every other seat
 * holder answers in the app, and the plan goes public the moment the last one agrees. One "not
 * this one" stops it; the crew only ever sees a count, never who said no.
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  publishSharedPlanPayloadSchema,
  respondPublishConsentPayloadSchema,
  sharedPlanIdPayloadSchema,
  type SharedPlanStateResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { requireTripMember } from '../../plan/access';
import { defineCommand } from '../_framework/define-command';
import { seatHolders, tripForSharing } from './skeleton';
import {
  liveSharedPlanId,
  one,
  postCrewLine,
  publishNow,
  sharedPlanById,
  unpublish,
  type SharedPlanRow,
} from './store';

async function requireConsentRow(tx: pg.PoolClient, planId: string, uid: string) {
  const { rows } = await tx.query<{ decision: string }>(
    'SELECT decision FROM shared_plan_consents WHERE shared_plan_id = $1 AND user_id = $2',
    [planId, uid],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('FORBIDDEN', { reason: 'not_participant' });
  return row.decision;
}

async function setDecision(tx: pg.PoolClient, planId: string, uid: string, decision: string) {
  await tx.query(
    `UPDATE shared_plan_consents SET decision = $3, decided_at = now()
      WHERE shared_plan_id = $1 AND user_id = $2`,
    [planId, uid, decision],
  );
}

async function everyoneAgreed(tx: pg.PoolClient, planId: string): Promise<boolean> {
  const { rows } = await tx.query<{ waiting: number }>(
    `SELECT count(*) FILTER (WHERE decision <> 'approved')::int AS waiting
       FROM shared_plan_consents WHERE shared_plan_id = $1`,
    [planId],
  );
  return (rows[0]?.waiting ?? 1) === 0;
}

async function event(
  tx: pg.PoolClient,
  plan: Pick<SharedPlanRow, 'id' | 'trip_id' | 'crew_id'>,
  type: 'shared_plan.requested' | 'shared_plan.consent_given',
  uid: string,
) {
  await appendDomainEvent(tx, {
    type,
    aggregateKind: 'trip',
    aggregateId: plan.trip_id,
    actorKind: 'user',
    actorId: uid,
    tripId: plan.trip_id,
    crewId: plan.crew_id,
    payload: { shared_plan_id: plan.id, trip_id: plan.trip_id, user_id: uid },
  });
}

export const publishSharedPlanCommand = defineCommand({
  name: 'publish_shared_plan',
  v: 1,
  schema: publishSharedPlanPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireTripMember(tx, payload.trip_id);
  },
  handle: (tx, payload, ctx): Promise<SharedPlanStateResult> =>
    asSystemRole(tx, async () => {
      await tx.query('SELECT 1 FROM trips WHERE id = $1 FOR UPDATE', [payload.trip_id]);
      const holders = await seatHolders(tx, payload.trip_id);
      if (!holders.some((holder) => holder.user_id === ctx.uid)) {
        throw new DomainError('FORBIDDEN', { reason: 'not_participant' });
      }
      const trip = await tripForSharing(tx, payload.trip_id);
      if (trip?.destination_id == null || trip.version_id === null) {
        throw new DomainError('STATE_INVALID', { reason: 'no_plan' });
      }
      if ((await liveSharedPlanId(tx, payload.trip_id)) !== null) {
        throw new DomainError('STATE_INVALID', { reason: 'already_shared' });
      }
      const uids = holders.map((holder) => holder.user_id);
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO shared_plans (trip_id, destination_id, requested_by, toggles,
                                   consent_required_uids, crew_size)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          payload.trip_id,
          trip.destination_id,
          ctx.uid,
          JSON.stringify(payload.toggles),
          uids,
          Math.max(1, uids.length),
        ],
      );
      const id = one(rows).id;
      await tx.query(
        `INSERT INTO shared_plan_consents (shared_plan_id, user_id, decision, decided_at)
         SELECT $1, uid, CASE WHEN uid = $2 THEN 'approved' ELSE 'pending' END,
                CASE WHEN uid = $2 THEN now() END
           FROM unnest($3::uuid[]) AS uid`,
        [id, ctx.uid, uids],
      );
      const plan = await sharedPlanById(tx, id);
      await event(tx, plan, 'shared_plan.requested', ctx.uid);
      if (await everyoneAgreed(tx, id)) {
        await publishNow(tx, plan, ctx.uid);
        return { shared_plan_id: id, status: 'published' };
      }
      await postCrewLine(tx, plan.crew_id, 'plan_publish_requested', id);
      return { shared_plan_id: id, status: 'pending_consent' };
    }),
});

export const respondPublishConsentCommand = defineCommand({
  name: 'respond_publish_consent',
  v: 1,
  schema: respondPublishConsentPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireConsentRow(tx, payload.shared_plan_id, ctx.uid);
  },
  handle: (tx, payload, ctx): Promise<SharedPlanStateResult> =>
    asSystemRole(tx, async () => {
      const plan = await sharedPlanById(tx, payload.shared_plan_id, { lock: true });
      const decision = await requireConsentRow(tx, plan.id, ctx.uid);
      if (plan.status !== 'pending_consent' || decision !== 'pending') {
        if (decision === (payload.approve ? 'approved' : 'declined')) {
          return { shared_plan_id: plan.id, status: plan.status };
        }
        throw new DomainError('STATE_INVALID', { reason: 'not_pending' });
      }
      if (!payload.approve) {
        await setDecision(tx, plan.id, ctx.uid, 'declined');
        await tx.query("UPDATE shared_plans SET status = 'declined' WHERE id = $1", [plan.id]);
        await postCrewLine(tx, plan.crew_id, 'plan_publish_declined', plan.id);
        await appendDomainEvent(tx, {
          type: 'shared_plan.declined',
          aggregateKind: 'trip',
          aggregateId: plan.trip_id,
          actorKind: 'user',
          actorId: ctx.uid,
          tripId: plan.trip_id,
          crewId: plan.crew_id,
          payload: { shared_plan_id: plan.id, trip_id: plan.trip_id },
        });
        return { shared_plan_id: plan.id, status: 'declined' };
      }
      await setDecision(tx, plan.id, ctx.uid, 'approved');
      await event(tx, plan, 'shared_plan.consent_given', ctx.uid);
      if (!(await everyoneAgreed(tx, plan.id))) {
        return { shared_plan_id: plan.id, status: 'pending_consent' };
      }
      await publishNow(tx, plan, ctx.uid);
      return { shared_plan_id: plan.id, status: 'published' };
    }),
});

/** Any participant may take their yes back later: the plan comes down, naming nobody. */
export const withdrawPublishConsentCommand = defineCommand({
  name: 'withdraw_publish_consent',
  v: 1,
  schema: sharedPlanIdPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireConsentRow(tx, payload.shared_plan_id, ctx.uid);
  },
  handle: (tx, payload, ctx): Promise<SharedPlanStateResult> =>
    asSystemRole(tx, async () => {
      const plan = await sharedPlanById(tx, payload.shared_plan_id, { lock: true });
      if (plan.status === 'unpublished' || plan.status === 'declined') {
        return { shared_plan_id: plan.id, status: plan.status };
      }
      await setDecision(tx, plan.id, ctx.uid, 'withdrawn');
      await unpublish(tx, plan, 'consent_withdrawn', { kind: 'user', id: ctx.uid });
      return { shared_plan_id: plan.id, status: 'unpublished' };
    }),
});
