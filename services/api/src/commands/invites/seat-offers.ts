/**
 * The waitlist's two commands. `promote_waitlist` (system door only) offers every free seat of a
 * trip to the next people waiting, each for 24 hours, and announces each offer (`trip.seat_opened`,
 * the seat-opened push). `accept_seat_offer` lets the offered member take the seat while the offer
 * is open; nobody is ever seated without accepting.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import {
  acceptSeatOfferPayloadSchema,
  canAcceptOffer,
  DomainError,
  promoteWaitlistPayloadSchema,
  SEAT_OFFER_WINDOW_HOURS,
  tripChannel,
  type PromoteWaitlistResult,
} from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { lockTripSeats } from './seat-claim';

export const promoteWaitlistCommand = defineCommand({
  name: 'promote_waitlist',
  v: 1,
  schema: promoteWaitlistPayloadSchema,
  offline: false,
  internal: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload): Promise<PromoteWaitlistResult> => {
    const { rows } = await tx.query<{
      offer_id: string;
      offered_user: string;
      offer_expires_at: Date;
    }>('SELECT * FROM app.offer_freed_seats($1, make_interval(hours => $2))', [
      payload.trip_id,
      SEAT_OFFER_WINDOW_HOURS,
    ]);
    for (const row of rows) {
      await appendDomainEvent(tx, {
        type: 'trip.seat_opened',
        aggregateKind: 'seat_offer',
        aggregateId: row.offer_id,
        actorKind: 'system',
        actorId: null,
        payload: {
          trip_id: payload.trip_id,
          offer_id: row.offer_id,
          user_id: row.offered_user,
          expires_at: row.offer_expires_at.toISOString(),
        },
        tripId: payload.trip_id,
      });
    }
    return {
      trip_id: payload.trip_id,
      offers: rows.map((row) => ({ offer_id: row.offer_id, user_id: row.offered_user })),
    };
  },
});

export const acceptSeatOfferCommand = defineCommand({
  name: 'accept_seat_offer',
  v: 1,
  schema: acceptSeatOfferPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx) => {
    const { rows } = await tx.query<{
      trip_id: string;
      user_id: string;
      status: string;
      expires_at: Date;
      invite_id: string | null;
    }>(
      'SELECT trip_id, user_id, status, expires_at, invite_id FROM seat_waitlist_offers WHERE id = $1',
      [payload.offer_id],
    );
    const offer = rows[0];
    if (offer?.user_id !== ctx.uid) throw new DomainError('NOT_FOUND', { reason: 'offer' });
    if (offer.status !== 'offered' || offer.expires_at <= ctx.clock.serverNow) {
      throw new DomainError('STATE_INVALID', { reason: 'offer_closed', state: offer.status });
    }
    const lock = await lockTripSeats(tx, offer.trip_id);
    if (!canAcceptOffer({ seatsHeld: lock.seats_held, cap: lock.seat_cap })) {
      throw new DomainError('SEAT_LIMIT', {
        cap: lock.seat_cap,
        offer: lock.boost_active ? 'waitlist' : 'boost',
        trip_id: offer.trip_id,
        invitee: null,
        seats_taken: lock.seats_held,
      });
    }
    await tx.query(
      `UPDATE trip_participants SET rsvp = 'in', waitlist_position = NULL
        WHERE trip_id = $1 AND user_id = $2 AND rsvp = 'waitlisted'`,
      [offer.trip_id, ctx.uid],
    );
    await tx.query(
      `UPDATE seat_waitlist_offers SET status = 'accepted', responded_at = $2 WHERE id = $1`,
      [payload.offer_id, ctx.clock.serverNow],
    );
    if (offer.invite_id !== null) {
      await tx.query(
        `UPDATE invites SET status = 'claimed', waitlist_position = NULL
          WHERE id = $1 AND status = 'waitlisted'`,
        [offer.invite_id],
      );
    }
    const { rows: crewRows } = await tx.query<{ crew_id: string }>(
      'SELECT crew_id FROM trips WHERE id = $1',
      [offer.trip_id],
    );
    await appendDomainEvent(tx, {
      type: 'seat_offer.accepted',
      aggregateKind: 'seat_offer',
      aggregateId: payload.offer_id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { trip_id: offer.trip_id, offer_id: payload.offer_id, user_id: ctx.uid },
      crewId: crewRows[0]?.crew_id ?? null,
      tripId: offer.trip_id,
    });
    await outbox(tx, tripChannel(offer.trip_id), 'seat.count', {
      trip_id: offer.trip_id,
      seats_taken: lock.seats_held + 1,
      cap: lock.seat_cap,
    });
    return { trip_id: offer.trip_id, offer_id: payload.offer_id, seated: true };
  },
});
