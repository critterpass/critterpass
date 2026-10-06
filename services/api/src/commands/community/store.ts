/**
 * Shared steps of the community commands, run as the system after each command authorised its
 * caller: reading a shared plan, materialising its public copy, unpublishing it, and the crew
 * chat lines that tell the crew what happened (never naming who declined or withdrew).
 */
import { appendDomainEvent } from '@cp/db';
import {
  buildSharedPlanProjection,
  DomainError,
  planTaste,
  sharedPlanTogglesSchema,
  type SharedPlanStatus,
  type SharedPlanToggles,
} from '@cp/domain';
import type pg from 'pg';

import { loadPlanSkeleton, tripForSharing } from './skeleton';

/** The single row a write returning one row gave back. */
export function one<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('expected a row');
  return row;
}

export interface SharedPlanRow {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly status: SharedPlanStatus;
  readonly toggles: SharedPlanToggles;
  readonly requested_by: string | null;
  readonly consent_required_uids: string[];
}

export async function sharedPlanById(
  tx: pg.PoolClient,
  id: string,
  { lock = false } = {},
): Promise<SharedPlanRow> {
  const { rows } = await tx.query<SharedPlanRow>(
    `SELECT s.id, s.trip_id, t.crew_id, s.status, s.toggles, s.requested_by,
            s.consent_required_uids
       FROM shared_plans s JOIN trips t ON t.id = s.trip_id
      WHERE s.id = $1 ${lock ? 'FOR UPDATE OF s' : ''}`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'shared_plan' });
  return { ...row, toggles: sharedPlanTogglesSchema.parse(row.toggles) };
}

/** The live (asked, preparing or published) plan of a trip, if any. */
export async function liveSharedPlanId(tx: pg.PoolClient, tripId: string): Promise<string | null> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT id FROM shared_plans
      WHERE trip_id = $1 AND status IN ('pending_consent', 'preparing', 'published')`,
    [tripId],
  );
  return rows[0]?.id ?? null;
}

export async function isOrganiser(tx: pg.PoolClient, tripId: string, uid: string) {
  const { rows } = await tx.query(
    `SELECT 1 FROM trip_participants WHERE trip_id = $1 AND user_id = $2 AND role = 'organiser'`,
    [tripId, uid],
  );
  return rows.length > 0;
}

/** The requester and the trip's organisers manage a plan; everyone else only answers for themselves. */
export async function requireManager(tx: pg.PoolClient, plan: SharedPlanRow, uid: string) {
  if (plan.requested_by === uid || (await isOrganiser(tx, plan.trip_id, uid))) return;
  throw new DomainError('FORBIDDEN', { reason: 'not_organiser' });
}

export async function postCrewLine(
  tx: pg.PoolClient,
  crewId: string,
  kind: string,
  refId: string,
): Promise<void> {
  await tx.query('SELECT app.post_crew_system_message($1, $2, $3, NULL)', [crewId, kind, refId]);
}

/** Builds and stores the public copy from the plan as it stands, and marks the plan published. */
export async function materialise(
  tx: pg.PoolClient,
  plan: SharedPlanRow,
  toggles: SharedPlanToggles,
): Promise<void> {
  const trip = await tripForSharing(tx, plan.trip_id);
  const skeleton = trip === null ? null : await loadPlanSkeleton(tx, trip);
  if (skeleton === null) throw new DomainError('STATE_INVALID', { reason: 'no_plan' });
  const projection = buildSharedPlanProjection(skeleton, toggles);
  await tx.query(
    `UPDATE shared_plans
        SET status = 'published', toggles = $2, projection = $3, days_count = $4,
            travel_month = $5, travel_year = $6, crew_size = $7, cost_pp_rounded_minor = $8,
            currency = $9, tags = $10, taste = $11, travelled = $12,
            published_at = coalesce(published_at, now())
      WHERE id = $1`,
    [
      plan.id,
      JSON.stringify(toggles),
      JSON.stringify(projection),
      projection.days_count,
      projection.travel_month,
      projection.travel_year,
      projection.crew_size,
      projection.cost_pp_rounded_minor,
      projection.currency,
      projection.tags,
      JSON.stringify(planTaste(skeleton.days)),
      projection.travelled,
    ],
  );
}

export async function publishNow(tx: pg.PoolClient, plan: SharedPlanRow, actorId: string) {
  await materialise(tx, plan, plan.toggles);
  await postCrewLine(tx, plan.crew_id, 'plan_published', plan.requested_by ?? actorId);
  await appendDomainEvent(tx, {
    type: 'shared_plan.published',
    aggregateKind: 'trip',
    aggregateId: plan.trip_id,
    actorKind: 'user',
    actorId,
    tripId: plan.trip_id,
    crewId: plan.crew_id,
    payload: { shared_plan_id: plan.id, trip_id: plan.trip_id },
  });
}

export type UnpublishReason = 'crew' | 'consent_withdrawn' | 'participant_left' | 'ops';

/** Takes a plan down: its public copy is emptied and its read-only links stop working. */
export async function unpublish(
  tx: pg.PoolClient,
  plan: SharedPlanRow,
  reason: UnpublishReason,
  actor: { kind: 'user' | 'system'; id: string | null },
  note: string | null = null,
): Promise<void> {
  await tx.query(
    `UPDATE shared_plans
        SET status = 'unpublished', projection = '{}'::jsonb, unpublished_at = now(),
            unpublish_reason = $2
      WHERE id = $1`,
    [plan.id, note],
  );
  await tx.query(
    'UPDATE plan_links SET revoked_at = now() WHERE shared_plan_id = $1 AND revoked_at IS NULL',
    [plan.id],
  );
  if (plan.status === 'published')
    await postCrewLine(tx, plan.crew_id, 'plan_unpublished', plan.id);
  await appendDomainEvent(tx, {
    type: 'shared_plan.unpublished',
    aggregateKind: 'trip',
    aggregateId: plan.trip_id,
    actorKind: actor.kind,
    actorId: actor.id,
    tripId: plan.trip_id,
    crewId: plan.crew_id,
    payload: { shared_plan_id: plan.id, trip_id: plan.trip_id, reason },
  });
}
