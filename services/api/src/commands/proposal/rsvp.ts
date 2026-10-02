/**
 * The RSVP writes `set_rsvp` and `decline_trip` share. A seat is claimed under the trip's row lock
 * (seat cap 6, or 16 while boosted): past the cap the reply is stored as a waitlist place and the
 * result says `SEAT_CAP_REACHED`. Going out frees the seat, queues the re-split and offers the seat
 * to the next person waiting; nothing else moves until the organiser applies the change set.
 */
import { appendDomainEvent, sendInTx } from '@cp/db';
import {
  DomainError,
  PROPOSAL_QUEUES,
  PROPOSAL_RT,
  SEAT_CAP_REACHED,
  type TripParticipantRsvp,
} from '@cp/domain';
import type pg from 'pg';

import { claimTripSeat, lockTripSeats } from '../invites/seat-claim';
import { publishProposal } from './shared';

export interface RsvpResult {
  readonly rsvp: TripParticipantRsvp;
  readonly waitlisted: boolean;
  readonly code?: typeof SEAT_CAP_REACHED;
  readonly waitlist_position?: number | null;
  readonly cap?: number;
  readonly boost_active?: boolean;
}

interface RsvpScope {
  readonly tripId: string;
  readonly crewId: string;
  readonly uid: string;
  /** The proposal the reply answers, when there is one to publish on. */
  readonly proposalId: string | null;
}

async function announce(tx: pg.PoolClient, scope: RsvpScope, rsvp: TripParticipantRsvp) {
  await appendDomainEvent(tx, {
    type: 'rsvp.changed',
    aggregateKind: 'trip',
    aggregateId: scope.tripId,
    actorKind: 'user',
    actorId: scope.uid,
    payload: { trip_id: scope.tripId, user_id: scope.uid, rsvp },
    crewId: scope.crewId,
    tripId: scope.tripId,
  });
  if (scope.proposalId !== null) {
    await publishProposal(tx, scope.proposalId, PROPOSAL_RT.rsvpStatus, {
      user_id: scope.uid,
      status: rsvp,
    });
  }
}

/** `in` or `maybe`: takes a seat when there is one, else a waitlist place. */
export async function replyWithSeat(
  tx: pg.PoolClient,
  scope: RsvpScope,
  status: 'in' | 'maybe',
): Promise<RsvpResult> {
  const before = await tx.query<{ rsvp: string }>(
    'SELECT rsvp FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
    [scope.tripId, scope.uid],
  );
  const claim = await claimTripSeat(tx, scope.tripId, scope.uid);
  if (claim.outcome === 'waitlisted') {
    if (before.rows[0]?.rsvp !== 'waitlisted') await announce(tx, scope, 'waitlisted');
    return {
      rsvp: 'waitlisted',
      waitlisted: true,
      code: SEAT_CAP_REACHED,
      waitlist_position: claim.waitlistPosition,
      cap: claim.cap,
      boost_active: claim.boostActive,
    };
  }
  if (before.rows[0]?.rsvp !== status) {
    await tx.query('UPDATE trip_participants SET rsvp = $3 WHERE trip_id = $1 AND user_id = $2', [
      scope.tripId,
      scope.uid,
      status,
    ]);
    await announce(tx, scope, status);
  }
  return { rsvp: status, waitlisted: false };
}

/** The participant row of a crew member who declines before ever answering: out, no seat. */
async function outWithoutReply(
  tx: pg.PoolClient,
  scope: RsvpScope,
): Promise<{ rsvp: string; holds_seat: boolean }> {
  const member = await tx.query(
    `SELECT 1 FROM crew_members WHERE crew_id = $1 AND user_id = $2 AND status = 'active'`,
    [scope.crewId, scope.uid],
  );
  if (member.rows.length === 0) {
    throw new DomainError('NOT_ELIGIBLE', { reason: 'not_a_participant' });
  }
  await tx.query(
    `INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'out')`,
    [scope.tripId, scope.uid],
  );
  return { rsvp: 'out', holds_seat: false };
}

/**
 * `out`: frees the seat (or waitlist place) and queues the re-split and the seat offer. A crew
 * member with no reply yet is recorded as out; with no seat to free there is no re-split.
 */
export async function declineSeat(tx: pg.PoolClient, scope: RsvpScope): Promise<RsvpResult> {
  await lockTripSeats(tx, scope.tripId);
  const { rows } = await tx.query<{ rsvp: string; holds_seat: boolean }>(
    'SELECT rsvp, holds_seat FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
    [scope.tripId, scope.uid],
  );
  const existing = rows[0];
  if (existing?.rsvp === 'out') return { rsvp: 'out', waitlisted: false };
  // A crew member who never answered has no participant row yet: their decline is stored as one,
  // out and holding no seat. Anyone outside the crew is refused.
  const row = existing ?? (await outWithoutReply(tx, scope));
  if (existing !== undefined) {
    await tx.query(
      `UPDATE trip_participants SET rsvp = 'out', waitlist_position = NULL
        WHERE trip_id = $1 AND user_id = $2`,
      [scope.tripId, scope.uid],
    );
  }
  await announce(tx, scope, 'out');
  await appendDomainEvent(tx, {
    type: 'participant.declined',
    aggregateKind: 'trip',
    aggregateId: scope.tripId,
    actorKind: 'user',
    actorId: scope.uid,
    payload: { trip_id: scope.tripId, user_id: scope.uid },
    crewId: scope.crewId,
    tripId: scope.tripId,
  });
  if (row.holds_seat) {
    const key = `${scope.tripId}:${scope.uid}`;
    await sendInTx(
      tx,
      PROPOSAL_QUEUES.dropout,
      { trip_id: scope.tripId, user_id: scope.uid },
      { singletonKey: key },
    );
    await sendInTx(
      tx,
      PROPOSAL_QUEUES.waitlist,
      { trip_id: scope.tripId },
      { singletonKey: scope.tripId },
    );
  }
  return { rsvp: 'out', waitlisted: false };
}
