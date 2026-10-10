/**
 * Who may do what on a trip's plan, asked as the caller (the RLS helpers decide): any active member
 * of the trip's crew reads and comments; organisers and co-organisers edit directly. What a member
 * may do to the crew's plan follows the trip's plan-change rule: propose a change set (the
 * default), edit directly (`anyone`), or neither (`organiser_only`).
 * A trip the caller cannot see answers `NOT_FOUND`, never `FORBIDDEN`.
 */
import { DomainError, planChangeRuleOf, planEditRights, type PlanEditRights } from '@cp/domain';
import type pg from 'pg';

export interface TripAccess {
  readonly member: boolean;
  readonly organiser: boolean;
}

export async function tripAccess(tx: pg.PoolClient, tripId: string): Promise<TripAccess> {
  const { rows } = await tx.query<TripAccess>(
    'SELECT app.is_trip_member($1) AS member, app.is_trip_organiser($1) AS organiser',
    [tripId],
  );
  return { member: rows[0]?.member === true, organiser: rows[0]?.organiser === true };
}

export async function requireTripMember(tx: pg.PoolClient, tripId: string): Promise<TripAccess> {
  const access = await tripAccess(tx, tripId);
  if (!access.member) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return access;
}

/** What the caller may do to the crew's plan under the trip's plan-change rule. */
export async function planRightsOf(tx: pg.PoolClient, tripId: string): Promise<PlanEditRights> {
  const { rows } = await tx.query<TripAccess & { rule: string | null }>(
    `SELECT app.is_trip_member($1) AS member, app.is_trip_organiser($1) AS organiser,
            (SELECT plan_change_rule FROM trips WHERE id = $1) AS rule`,
    [tripId],
  );
  const row = rows[0];
  return planEditRights({
    member: row?.member === true,
    organiser: row?.organiser === true,
    rule: planChangeRuleOf(row?.rule),
  });
}

/**
 * Organisers and co-organisers, and every member on a trip whose rule is `anyone`; anyone else is
 * told to propose a change set instead.
 */
export async function requirePlanEditor(tx: pg.PoolClient, tripId: string): Promise<void> {
  await requireTripMember(tx, tripId);
  if (!(await planRightsOf(tx, tripId)).direct) {
    throw new DomainError('FORBIDDEN', { reason: 'use_changeset' });
  }
}

/** A member on a trip whose rule keeps the crew's plan to organisers proposes nothing to it. */
export async function requirePlanProposer(tx: pg.PoolClient, tripId: string): Promise<void> {
  if (!(await planRightsOf(tx, tripId)).propose) {
    throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
  }
}

/** Organisers of the trip (every `role = 'organiser'` seat). */
export async function tripOrganiserIds(tx: pg.PoolClient, tripId: string): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    "SELECT user_id FROM trip_participants WHERE trip_id = $1 AND role = 'organiser'",
    [tripId],
  );
  return rows.map((row) => row.user_id);
}

/**
 * Who a plan change can touch: the trip's seat holders once more than the organiser holds one,
 * otherwise every active member of the crew (before RSVPs, the whole crew is planning).
 */
export async function tripVoters(
  tx: pg.PoolClient,
  tripId: string,
  crewId: string,
): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string; seat: boolean }>(
    `SELECT m.user_id, coalesce(p.holds_seat, false) AS seat
       FROM crew_members m
       LEFT JOIN trip_participants p ON p.trip_id = $1 AND p.user_id = m.user_id
      WHERE m.crew_id = $2 AND m.status = 'active'
      ORDER BY m.user_id`,
    [tripId, crewId],
  );
  const seats = rows.filter((row) => row.seat).map((row) => row.user_id);
  return seats.length > 1 ? seats : rows.map((row) => row.user_id);
}
