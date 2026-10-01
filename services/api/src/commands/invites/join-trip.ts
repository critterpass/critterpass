/**
 * Getting on a trip that is already locked in. A proposal's RSVP seats the people it was sent to;
 * once the trip is confirmed, about to start or under way no proposal reaches anyone new, so a crew
 * member who is not on it takes a seat directly: `join_trip` for someone already in the crew, and
 * the same claim inside `accept_invite` for someone joining the crew (./accept-invite.ts). The seat
 * is the RSVP's own write: IN while a seat is free under the trip's row lock, a waitlist place past
 * the cap, and the `rsvp.changed` event an RSVP produces, so the countdown, the eggs, the crew's
 * activity and every roster follow. Nobody is moved off a waitlist ahead of the people before them.
 */
import {
  DomainError,
  joinTripPayloadSchema,
  tripTakesJoiners,
  type JoinTripResult,
} from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';
import { replyWithSeat } from '../proposal/rsvp';
import { lockTripSeats } from './seat-claim';

export interface OpenSeatScope {
  readonly tripId: string;
  readonly crewId: string;
  readonly uid: string;
}

/** The proposal the trip was confirmed from (its channel hears the reply), when there is one. */
async function sentProposalId(tx: pg.PoolClient, tripId: string): Promise<string | null> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT id FROM proposals
      WHERE trip_id = $1 AND sent_at IS NOT NULL AND status IN ('sent', 'locked')
      ORDER BY sent_at DESC LIMIT 1`,
    [tripId],
  );
  return rows[0]?.id ?? null;
}

/**
 * Seats (or waitlists) the caller on a trip that takes joiners. `NOT_FOUND` when the caller is not
 * in the trip's crew, `STATE_INVALID` when the trip is closed or not locked in yet.
 */
export async function takeOpenSeat(
  tx: pg.PoolClient,
  scope: OpenSeatScope,
): Promise<JoinTripResult> {
  // The trip's row lock is held to commit, so the status read here cannot move under the claim.
  const lock = await lockTripSeats(tx, scope.tripId);
  if (!tripTakesJoiners(lock.trip_status)) {
    throw new DomainError('STATE_INVALID', { reason: 'trip_status', state: lock.trip_status });
  }
  const reply = await replyWithSeat(
    tx,
    { ...scope, proposalId: await sentProposalId(tx, scope.tripId) },
    'in',
  );
  return {
    trip_id: scope.tripId,
    seated: !reply.waitlisted,
    waitlisted: reply.waitlisted,
    waitlist_position: reply.waitlist_position ?? null,
    ...(reply.cap === undefined ? {} : { cap: reply.cap }),
    ...(reply.boost_active === undefined ? {} : { boost_active: reply.boost_active }),
  };
}

/**
 * Seats the caller on the crew's trips that take joiners (or only on `onlyTripId` when given): the
 * one under way first, then by first day. A trip that closed or was never locked in is skipped, so
 * a crew join never fails over a trip.
 */
export async function seatOnOpenTrips(
  tx: pg.PoolClient,
  crewId: string,
  uid: string,
  onlyTripId: string | null = null,
): Promise<JoinTripResult[]> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT id FROM trips
      WHERE crew_id = $1 AND status IN ('confirmed', 'pre_trip', 'in_trip')
        AND ($2::uuid IS NULL OR id = $2)
      ORDER BY (status = 'in_trip') DESC, start_date NULLS LAST, id`,
    [crewId, onlyTripId],
  );
  const seats: JoinTripResult[] = [];
  for (const { id: tripId } of rows) {
    try {
      seats.push(await takeOpenSeat(tx, { tripId, crewId, uid }));
    } catch (error) {
      // The trip moved on between the read and its lock; nothing was written for it.
      if (!(error instanceof DomainError) || error.code !== 'STATE_INVALID') throw error;
    }
  }
  return seats;
}

export const joinTripCommand = defineCommand({
  name: 'join_trip',
  v: 1,
  schema: joinTripPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<JoinTripResult> => {
    // RLS shows a trip only to its crew, so a stranger learns nothing about it.
    const { rows } = await tx.query<{ crew_id: string }>(
      'SELECT crew_id FROM trips WHERE id = $1',
      [payload.trip_id],
    );
    const trip = rows[0];
    if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
    return takeOpenSeat(tx, { tripId: payload.trip_id, crewId: trip.crew_id, uid: ctx.uid });
  },
});
