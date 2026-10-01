/**
 * `lock_proposal` (docs/api-contracts-proposal.md): the organiser locks the crew in once at least
 * one recipient is IN, before reply-by. Under the trip's seat lock: every MAYBE becomes a waitlist
 * place (first in line for a freed seat), every recipient who never answered is out, the open
 * activity holds of the people now off the trip are released (the IN members' holds stay for the
 * booking flow to convert), the proposed plan version becomes `current`, the proposal locks and the
 * trip moves `proposed → confirmed` through the one lock path the reply-by job shares. A proposal
 * reply-by locked without confirming the trip can still be locked in here; locking a confirmed one
 * changes nothing.
 */
import {
  appendDomainEvent,
  cancelScheduledEvent,
  isConfirmedOrLater,
  lockProposalAndConfirm,
} from '@cp/db';
import {
  DomainError,
  isOpenHold,
  PROPOSAL_RT,
  proposalIdPayloadSchema,
  SUPPLIER_QUEUES,
  type TripParticipantRsvp,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { lockOrder, moveOrder } from '../../suppliers/order-store';
import { defineCommand } from '../_framework/define-command';
import { lockTripSeats } from '../invites/seat-claim';
import { publishProposal, requireProposalOrganiser, type ProposalRow } from './shared';

export interface LockResult {
  readonly proposal_id: string;
  readonly trip_status: 'confirmed';
  readonly in: number;
  readonly waitlisted: number;
  readonly out: number;
}

interface Recipient {
  readonly user_id: string;
  readonly rsvp: string;
}

async function recipients(tx: pg.PoolClient, proposal: ProposalRow): Promise<Recipient[]> {
  const { rows } = await tx.query<Recipient>(
    `SELECT tp.user_id, tp.rsvp FROM proposal_versions v
       JOIN trip_participants tp ON tp.trip_id = v.trip_id AND tp.user_id = v.recipient_id
      WHERE v.proposal_id = $1 ORDER BY tp.created_at, tp.user_id`,
    [proposal.id],
  );
  return rows;
}

async function move(
  tx: pg.PoolClient,
  proposal: ProposalRow,
  actor: string,
  uid: string,
  rsvp: TripParticipantRsvp,
): Promise<void> {
  if (rsvp === 'waitlisted') {
    await tx.query(
      `UPDATE trip_participants SET rsvp = 'waitlisted',
              waitlist_position = (SELECT coalesce(max(waitlist_position), 0) + 1
                                     FROM trip_participants WHERE trip_id = $1)
        WHERE trip_id = $1 AND user_id = $2`,
      [proposal.trip_id, uid],
    );
  } else {
    await tx.query(
      `UPDATE trip_participants SET rsvp = $3, waitlist_position = NULL
        WHERE trip_id = $1 AND user_id = $2`,
      [proposal.trip_id, uid, rsvp],
    );
  }
  await appendDomainEvent(tx, {
    type: 'rsvp.changed',
    aggregateKind: 'trip',
    aggregateId: proposal.trip_id,
    actorKind: 'user',
    actorId: actor,
    payload: { trip_id: proposal.trip_id, user_id: uid, rsvp },
    crewId: proposal.crew_id,
    tripId: proposal.trip_id,
  });
  await publishProposal(tx, proposal.id, PROPOSAL_RT.rsvpStatus, { user_id: uid, status: rsvp });
}

/** Lets go of the open activity holds of members no longer on the trip. */
async function releaseHolds(
  tx: pg.PoolClient,
  proposal: ProposalRow,
  actor: string,
  off: string[],
) {
  if (off.length === 0) return;
  const { rows } = await tx.query<{ id: string }>(
    'SELECT id FROM supplier_orders WHERE trip_id = $1 AND buyer_id = ANY ($2::uuid[])',
    [proposal.trip_id, off],
  );
  for (const { id } of rows) {
    const order = await lockOrder(tx, id);
    if (!isOpenHold(order.status)) continue;
    await moveOrder(tx, order, 'released', { hold_valid_until: null, next_poll_at: null });
    await cancelScheduledEvent(tx, { kind: SUPPLIER_QUEUES.holdExpiry, refId: order.id });
    await appendDomainEvent(tx, {
      type: 'activity.hold_released',
      aggregateKind: 'supplier_order',
      aggregateId: order.id,
      actorKind: 'user',
      actorId: actor,
      crewId: proposal.crew_id,
      tripId: proposal.trip_id,
      payload: { trip_id: proposal.trip_id, order_id: order.id },
    });
  }
}

export const lockProposalCommand = defineCommand({
  name: 'lock_proposal',
  v: 1,
  schema: proposalIdPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const proposal = await requireProposalOrganiser(tx, payload.proposal_id);
    if (proposal.status !== 'sent' && proposal.status !== 'locked') {
      throw new DomainError('STATE_INVALID', { state: proposal.status });
    }
  },
  handle: async (tx, payload, ctx): Promise<LockResult> => {
    const proposal = await requireProposalOrganiser(tx, payload.proposal_id);
    return asSystemRole(tx, async () => {
      await lockTripSeats(tx, proposal.trip_id);
      const people = await recipients(tx, proposal);
      const inCount = people.filter((p) => p.rsvp === 'in').length;
      const trip = await tx.query<{ status: string }>('SELECT status FROM trips WHERE id = $1', [
        proposal.trip_id,
      ]);
      const tripStatus = trip.rows[0]?.status ?? 'unknown';
      // Already locked in (by an earlier lock, or by reply-by with the trip confirmed): nothing
      // changes. A proposal that reply-by locked without confirming the trip can still be locked
      // in here, once someone is IN.
      if (proposal.status === 'locked' && isConfirmedOrLater(tripStatus)) {
        return {
          proposal_id: proposal.id,
          trip_status: 'confirmed',
          in: inCount,
          waitlisted: people.filter((p) => p.rsvp === 'waitlisted').length,
          out: people.filter((p) => p.rsvp === 'out').length,
        };
      }
      if (inCount === 0) throw new DomainError('STATE_INVALID', { reason: 'nobody_in' });
      const maybe = people.filter((p) => p.rsvp === 'maybe').map((p) => p.user_id);
      const unanswered = people
        .filter((p) => p.rsvp === 'unopened' || p.rsvp === 'opened')
        .map((p) => p.user_id);
      for (const uid of maybe) await move(tx, proposal, ctx.uid, uid, 'waitlisted');
      for (const uid of unanswered) await move(tx, proposal, ctx.uid, uid, 'out');
      await releaseHolds(tx, proposal, ctx.uid, [...maybe, ...unanswered]);
      const after = await lockProposalAndConfirm(tx, {
        proposalId: proposal.id,
        tripId: proposal.trip_id,
        crewId: proposal.crew_id,
        actor: { kind: 'user', id: ctx.uid },
        now: ctx.clock.serverNow,
        unanswered: unanswered.length,
      });
      if (!isConfirmedOrLater(after)) throw new DomainError('STATE_INVALID', { state: after });
      const waitlisted = people.filter((p) => p.rsvp === 'waitlisted').length + maybe.length;
      const out = people.filter((p) => p.rsvp === 'out').length + unanswered.length;
      return { proposal_id: proposal.id, trip_status: 'confirmed', in: inCount, waitlisted, out };
    });
  },
});
