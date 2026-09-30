/**
 * Who may do what on a trip's plan, asked as the caller (the RLS helpers decide): any active member
 * of the trip's crew reads, comments and proposes; organisers and co-organisers edit directly.
 * A trip the caller cannot see answers `NOT_FOUND`, never `FORBIDDEN`.
 */
import { DomainError } from '@cp/domain';
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

/** Organisers and co-organisers; a member is told to propose a change set instead. */
export async function requirePlanEditor(tx: pg.PoolClient, tripId: string): Promise<void> {
  const access = await requireTripMember(tx, tripId);
  if (!access.organiser) throw new DomainError('FORBIDDEN', { reason: 'use_changeset' });
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
