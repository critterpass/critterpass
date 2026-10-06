/**
 * The race-safe halves of a join: crew membership under the crew's row lock (ceiling 16, the
 * joiner's active-crew limit), then a trip seat under the trip's row lock (seat cap 6, or 16 while
 * boosted; waitlist past it). Locks are taken crew first, then trip, and held to commit, so any
 * number of concurrent joins seat exactly the free seats and queue the rest in order.
 */
import {
  allocateSeat,
  decideCrewJoin,
  DomainError,
  nextMemberColour,
  type ExistingParticipation,
} from '@cp/domain';
import type pg from 'pg';

import { activeCrewCount, maxActiveCrews } from '../crews/shared';

const CLOSED_TRIP_STATUSES = new Set(['cancelled', 'archived', 'post_trip']);

/** What entitles the caller to join the crew: the database checks it again before it adds them. */
export type JoinProof =
  { readonly code: string } | { readonly seatTokenHash: string } | { readonly inviteId: string };

/** Joins the caller to the crew (or finds them already in it). Returns whether they just joined. */
export async function joinCrew(
  tx: pg.PoolClient,
  crewId: string,
  uid: string,
  proof: JoinProof,
): Promise<boolean> {
  const { rows: lockRows } = await tx.query<{ active_members: number; member_ceiling: number }>(
    'SELECT active_members, member_ceiling FROM app.lock_crew_membership($1)',
    [crewId],
  );
  const lock = lockRows[0];
  if (lock === undefined) throw new DomainError('NOT_FOUND', { reason: 'crew' });
  const { rows: memberRows } = await tx.query<{ member: boolean }>(
    'SELECT app.is_crew_member($1) AS member',
    [crewId],
  );
  const decision = decideCrewJoin({
    alreadyMember: memberRows[0]?.member === true,
    activeMembers: lock.active_members,
    memberCeiling: lock.member_ceiling,
    joinerActiveCrews: await activeCrewCount(tx, uid),
    maxActiveCrews: await maxActiveCrews(tx),
  });
  switch (decision.kind) {
    case 'already_member':
      return false;
    case 'crew_full':
      throw new DomainError('STATE_INVALID', { reason: 'crew_full', ceiling: decision.ceiling });
    case 'crew_limit':
      throw new DomainError('STATE_INVALID', { reason: 'crew_limit', limit: decision.limit });
    case 'join':
      break;
  }

  // A former member's row comes back to life; anyone else gets a new one. The database joins
  // only a caller who holds the code or invite, whatever this command decided above.
  const { rows: joined } = await tx.query<{ joined: boolean }>(
    'SELECT app.join_crew($1, $2, $3, $4) AS joined',
    [
      crewId,
      'code' in proof ? proof.code : null,
      'seatTokenHash' in proof ? proof.seatTokenHash : null,
      'inviteId' in proof ? proof.inviteId : null,
    ],
  );
  if (joined[0]?.joined !== true) return false;
  // Now a member, the joiner can see the colours already taken.
  const { rows: colours } = await tx.query<{ colour: string | null }>(
    `SELECT colour FROM crew_members WHERE crew_id = $1 AND status = 'active' AND user_id <> $2`,
    [crewId, uid],
  );
  await tx.query('UPDATE crew_members SET colour = $3 WHERE crew_id = $1 AND user_id = $2', [
    crewId,
    uid,
    nextMemberColour(colours.map((row) => row.colour)),
  ]);
  return true;
}

export interface SeatClaim {
  readonly outcome: 'seated' | 'waitlisted';
  readonly waitlistPosition: number | null;
  readonly seatsTaken: number;
  readonly cap: number;
  readonly boostActive: boolean;
}

interface TripLock {
  readonly trip_status: string;
  readonly seats_held: number;
  readonly seat_cap: number;
  readonly boost_active: boolean;
  readonly open_offers: number;
  readonly last_waitlist_position: number | null;
}

export async function lockTripSeats(tx: pg.PoolClient, tripId: string): Promise<TripLock> {
  const { rows } = await tx.query<TripLock>(
    `SELECT trip_status, seats_held, seat_cap, boost_active, open_offers, last_waitlist_position
       FROM app.lock_trip_seats($1)`,
    [tripId],
  );
  const lock = rows[0];
  if (lock === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  if (CLOSED_TRIP_STATUSES.has(lock.trip_status)) {
    throw new DomainError('STATE_INVALID', { reason: 'trip_closed', state: lock.trip_status });
  }
  return lock;
}

/** Seats the caller on the trip, or waitlists them; the caller must already be in its crew. */
export async function claimTripSeat(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<SeatClaim> {
  const lock = await lockTripSeats(tx, tripId);
  const { rows } = await tx.query<{ rsvp: string; waitlist_position: number | null }>(
    'SELECT rsvp, waitlist_position FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
    [tripId, uid],
  );
  const row = rows[0];
  const existing: ExistingParticipation =
    row === undefined
      ? { kind: 'none' }
      : row.rsvp === 'out'
        ? { kind: 'out' }
        : row.rsvp === 'waitlisted'
          ? { kind: 'waitlisted', position: row.waitlist_position ?? 0 }
          : { kind: 'seated' };
  const allocation = allocateSeat(
    {
      seatsHeld: lock.seats_held,
      cap: lock.seat_cap,
      openOffers: lock.open_offers,
      lastWaitlistPosition: lock.last_waitlist_position,
    },
    existing,
  );
  const base = { cap: lock.seat_cap, boostActive: lock.boost_active };
  switch (allocation.kind) {
    case 'already_seated':
      return { ...base, outcome: 'seated', waitlistPosition: null, seatsTaken: lock.seats_held };
    case 'already_waitlisted':
      return {
        ...base,
        outcome: 'waitlisted',
        waitlistPosition: allocation.position,
        seatsTaken: lock.seats_held,
      };
    case 'seat':
    case 'waitlist': {
      const seated = allocation.kind === 'seat';
      const position = allocation.kind === 'waitlist' ? allocation.position : null;
      const rsvp = seated ? 'in' : 'waitlisted';
      if (row === undefined) {
        await tx.query(
          `INSERT INTO trip_participants (trip_id, user_id, role, rsvp, waitlist_position)
           VALUES ($1, $2, 'member', $3, $4)`,
          [tripId, uid, rsvp, position],
        );
      } else {
        await tx.query(
          `UPDATE trip_participants SET rsvp = $3, waitlist_position = $4
            WHERE trip_id = $1 AND user_id = $2`,
          [tripId, uid, rsvp, position],
        );
      }
      return {
        ...base,
        outcome: seated ? 'seated' : 'waitlisted',
        waitlistPosition: position,
        seatsTaken: lock.seats_held + (seated ? 1 : 0),
      };
    }
  }
}
