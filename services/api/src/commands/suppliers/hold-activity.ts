/**
 * `hold_activity` (docs/api-contracts.md §4.11): at booking time (after the crew agreed, never at
 * proposal time) a participant holds a Viator activity. The order and its item are written, the
 * cart is held with Viator's own payment form, and the answer says truthfully what is held: seats
 * only when availability is `HOLDING`, the price when only pricing is held. A hold that would lapse
 * before the crew could vote on it (`supplier.min_vote_window_min`, default 60) is not kept: the
 * copy is "book when agreed". A kept hold arms `supplier.hold_expiry` just before its deadline.
 */
import { appendDomainEvent, scheduleEvent } from '@cp/db';
import {
  DomainError,
  holdActivityPayloadSchema,
  holdLeavesVoteWindow,
  holdReleaseAt,
  SUPPLIER_QUEUES,
  type HoldActivityPayload,
  type HoldActivityResult,
} from '@cp/domain';
import { toSupplierDomainError, supplierRejected, type HoldResult } from '@cp/suppliers';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import type { ActivityBookingPort } from '../../suppliers/order-port';
import {
  findOrder,
  lockOrder,
  minVoteWindowMin,
  moveOrder,
  requireViatorOn,
  toMinor,
  type OrderRow,
} from '../../suppliers/order-store';
import { requireInTrip, requireTripParticipant } from '../bookings/shared';
import { defineCommand } from '../_framework/define-command';

export interface OrderCommandDeps {
  /** Absent where the deployment has no Viator key: every order command is then unavailable. */
  readonly port?: ActivityBookingPort | undefined;
  /** The clock hold deadlines are judged against. */
  readonly now?: () => Date;
}

/** Our references: opaque, stable per order, never a user or trip id. */
function refFor(orderId: string, suffix: string): string {
  return `cp${orderId.replaceAll('-', '').slice(-20)}${suffix}`;
}

function resultOf(order: OrderRow, hold: HoldResult | null, bookWhenAgreed: boolean) {
  return {
    hold_id: order.id,
    status: order.status,
    hold_provided: hold?.holdProvided ?? false,
    seats_held_until: hold?.seatsHeldUntil ?? null,
    price_held_until: hold?.priceHeldUntil ?? null,
    book_when_agreed: bookWhenAgreed,
    total:
      order.total_minor === null || order.currency === null
        ? null
        : { amount_minor: Number(order.total_minor), currency: order.currency },
  } satisfies HoldActivityResult;
}

async function insertOrder(
  tx: pg.PoolClient,
  payload: HoldActivityPayload,
  buyer: string,
  participants: readonly string[],
): Promise<void> {
  const travellers = payload.pax.reduce((sum, band) => sum + band.count, 0);
  await asSystemRole(tx, async () => {
    await tx.query(
      `INSERT INTO supplier_orders (id, trip_id, buyer_id, supplier, stable_id, partner_cart_ref)
       VALUES ($1, $2, $3, 'viator', $4, $5)`,
      [
        payload.hold_id,
        payload.trip_id,
        buyer,
        payload.stable_id ?? null,
        refFor(payload.hold_id, 'c'),
      ],
    );
    await tx.query(
      `INSERT INTO supplier_order_items (order_id, trip_id, item_ref, product_code,
         product_option_code, travel_date, start_time, traveller_count, participant_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        payload.hold_id,
        payload.trip_id,
        refFor(payload.hold_id, 'i1'),
        payload.offer_ref,
        payload.option_code ?? null,
        payload.date,
        payload.time ?? null,
        travellers,
        participants,
      ],
    );
  });
}

export function createHoldActivityCommand(deps: OrderCommandDeps) {
  return defineCommand({
    name: 'hold_activity',
    v: 1,
    schema: holdActivityPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload, ctx) => {
      await requireTripParticipant(tx, payload.trip_id, ctx.uid);
    },
    entitle: async (tx) => {
      await requireViatorOn(tx);
    },
    handle: async (tx, payload, ctx): Promise<HoldActivityResult> => {
      const existing = await findOrder(tx, payload.hold_id);
      if (existing !== null) {
        if (existing.buyer_id !== ctx.uid) throw new DomainError('NOT_FOUND', { reason: 'order' });
        return resultOf(existing, null, existing.hold_valid_until === null);
      }
      if (deps.port === undefined) throw toSupplierDomainError(new Error('no adapter'), 'viator');
      const participants = payload.participant_ids ?? [ctx.uid];
      await requireInTrip(tx, payload.trip_id, participants);
      await insertOrder(tx, payload, ctx.uid, participants);
      let hold: HoldResult;
      try {
        hold = await deps.port.hold({
          cartRef: refFor(payload.hold_id, 'c'),
          currency: payload.currency,
          items: [
            {
              itemRef: refFor(payload.hold_id, 'i1'),
              productCode: payload.offer_ref,
              ...(payload.option_code === undefined ? {} : { optionCode: payload.option_code }),
              travelDate: payload.date,
              ...(payload.time === undefined ? {} : { startTime: payload.time }),
              pax: payload.pax.map((band) => ({ ageBand: band.age_band, count: band.count })),
            },
          ],
        });
      } catch (error) {
        throw toSupplierDomainError(error, 'viator');
      }
      const item = hold.items[0];
      if (item === undefined || !item.bookable) {
        throw supplierRejected('viator', item?.rejectionCode ?? 'OTHER');
      }
      const now = deps.now?.() ?? ctx.clock.serverNow;
      const deadline = hold.seatsHeldUntil ?? hold.priceHeldUntil ?? null;
      const until = deadline === null ? null : new Date(deadline);
      const kept = holdLeavesVoteWindow(until, now, await minVoteWindowMin(tx));
      const status = kept && hold.holdProvided ? 'holding' : 'hold_not_provided';
      const draft = await lockOrder(tx, payload.hold_id);
      await moveOrder(tx, draft, status, {
        cart_ref: hold.holdRef,
        payment_session_token: hold.paymentSessionToken,
        pricing_status: item.pricing,
        availability_status: item.availability,
        hold_valid_until: kept ? until : null,
        total_minor: toMinor(hold.total.amount, hold.total.currency).toString(),
        currency: hold.total.currency,
      });
      await asSystemRole(tx, () =>
        tx.query('UPDATE supplier_order_items SET supplier_booking_ref = $2 WHERE order_id = $1', [
          payload.hold_id,
          item.bookingRef,
        ]),
      );
      if (kept && until !== null) {
        await scheduleEvent(tx, {
          kind: SUPPLIER_QUEUES.holdExpiry,
          refId: payload.hold_id,
          tz: 'UTC',
          at: holdReleaseAt(until, now),
        });
      }
      const trip = await requireTripParticipant(tx, payload.trip_id, ctx.uid);
      await appendDomainEvent(tx, {
        type: 'activity.held',
        aggregateKind: 'supplier_order',
        aggregateId: payload.hold_id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: trip.crew_id,
        tripId: trip.id,
        payload: {
          trip_id: trip.id,
          order_id: payload.hold_id,
          hold_provided: kept && hold.holdProvided,
          status,
        },
      });
      const order = await lockOrder(tx, payload.hold_id);
      return resultOf(order, kept ? hold : null, !kept);
    },
  });
}
