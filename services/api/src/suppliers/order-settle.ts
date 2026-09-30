/**
 * What a supplier's answer does to an order (docs/data-model-sync-and-privacy.md §3.5): once the
 * booking is placed the wallet gets it at once ("Waiting for the operator" while pending); when it
 * is confirmed it becomes "Booked · Viator ref {ref}" and its price a crew expense paid by the
 * buyer and split between the travellers, in the same transaction; a rejection cancels the wallet
 * entry. Viator is the merchant of record: the expense records what the payer paid Viator.
 */
import { appendDomainEvent } from '@cp/db';
import {
  generateUuidV7,
  statusForOutcome,
  type SupplierBookingOutcome,
  type SupplierOrderStatus,
} from '@cp/domain';
import type { BookingStatus, VoucherRef } from '@cp/suppliers';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { splitBookingExpense } from '../bookings/booking-expense';
import { insertBooking } from '../bookings/booking-writer';
import type { BookingTrip } from '../commands/bookings/shared';
import { moveOrder, type OrderItemRow, type OrderRow } from './order-store';

/** Viator asks for at most one status read per booking every 3 minutes. */
export const STATUS_POLL_MIN_MS = 3 * 60_000;

export interface Settled {
  readonly status: SupplierOrderStatus;
  readonly bookingId: string | null;
  readonly expenseId: string | null;
}

function nextPollAt(hint: string | null, now: Date): Date {
  const floor = new Date(now.getTime() + STATUS_POLL_MIN_MS);
  const hinted = hint === null ? null : new Date(hint);
  return hinted !== null && !Number.isNaN(hinted.getTime()) && hinted > floor ? hinted : floor;
}

async function event(
  tx: pg.PoolClient,
  trip: BookingTrip,
  order: OrderRow,
  type: 'activity.booked' | 'activity.pending' | 'activity.rejected',
  bookingId: string | null,
): Promise<void> {
  const base = { trip_id: order.trip_id, order_id: order.id };
  await appendDomainEvent(tx, {
    type,
    aggregateKind: 'supplier_order',
    aggregateId: order.id,
    actorKind: 'system',
    actorId: null,
    crewId: trip.crew_id,
    tripId: trip.id,
    payload: type === 'activity.booked' ? { ...base, booking_id: bookingId } : base,
  });
}

/** The wallet entry for a placed order, created once (pending until the operator confirms). */
async function ensureWalletBooking(
  tx: pg.PoolClient,
  trip: BookingTrip,
  order: OrderRow,
  items: readonly OrderItemRow[],
  placed: { readonly title: string; readonly voucher: VoucherRef | null },
  now: Date,
): Promise<string> {
  if (order.voucher_booking_id !== null) return order.voucher_booking_id;
  const first = items[0];
  const travellers = [...new Set(items.flatMap((item) => item.participant_ids))];
  const id = generateUuidV7();
  const startsAt =
    first === undefined
      ? null
      : new Date(`${first.travel_date}T${first.start_time ?? '00:00'}:00Z`);
  await insertBooking(
    tx,
    {
      id,
      tripId: trip.id,
      crewId: trip.crew_id,
      ownerId: order.buyer_id,
      kind: 'activity',
      title: placed.title,
      startsAt,
      endsAt: null,
      tz: trip.tz,
      location: null,
      travellerIds: travellers.length > 0 ? travellers : [order.buyer_id],
      priceMinor: order.total_minor === null ? null : BigInt(order.total_minor),
      currency: order.currency,
      paidBy: order.buyer_id,
      source: 'viator',
      supplier: 'viator',
      supplierRef: first?.supplier_booking_ref ?? null,
      freeCancelUntil: null,
      cancelPolicyText: null,
      visibility: 'crew',
      flightCrewVisible: true,
      details: {
        operator: 'Viator',
        ...(placed.voucher === null ? {} : { notes: `Voucher: ${placed.voucher.url}` }),
      },
      barcode: null,
      segments: [],
      attachments: [],
    },
    order.buyer_id,
    now,
  );
  await asSystemRole(tx, () =>
    tx.query(
      "UPDATE bookings SET status = 'pending_operator', supplier_order_id = $2 WHERE id = $1",
      [id, order.id],
    ),
  );
  return id;
}

/**
 * Applies the supplier's answer for an order in `booking` or `pending_operator`: a placed booking
 * enters the wallet, a confirmed one becomes booked with its expense, a refused one is cancelled.
 */
export async function settleOrder(
  tx: pg.PoolClient,
  trip: BookingTrip,
  order: OrderRow,
  items: readonly OrderItemRow[],
  answer: {
    readonly outcome: SupplierBookingOutcome;
    readonly title: string | null;
    readonly voucher: VoucherRef | null;
    readonly rejectionCode: string | null;
    readonly nextPollHint: string | null;
  },
  now: Date,
): Promise<Settled> {
  const to = statusForOutcome(order.status, answer.outcome);
  if (to === null) {
    await moveOrder(tx, order, order.status, {
      last_polled_at: now,
      next_poll_at: nextPollAt(answer.nextPollHint, now),
    });
    return { status: order.status, bookingId: order.voucher_booking_id, expenseId: null };
  }
  if (to === 'rejected' || to === 'cancelled') {
    await moveOrder(tx, order, to, {
      last_polled_at: now,
      next_poll_at: null,
      rejection_code: answer.rejectionCode,
    });
    if (order.voucher_booking_id !== null) {
      await asSystemRole(tx, () =>
        tx.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [
          order.voucher_booking_id,
        ]),
      );
    }
    await event(tx, trip, order, 'activity.rejected', null);
    return { status: to, bookingId: order.voucher_booking_id, expenseId: null };
  }
  const title = answer.title ?? 'Viator activity';
  const bookingId = await ensureWalletBooking(
    tx,
    trip,
    order,
    items,
    { title, voucher: answer.voucher },
    now,
  );
  if (to === 'pending_operator') {
    await moveOrder(tx, order, to, {
      voucher_booking_id: bookingId,
      last_polled_at: now,
      next_poll_at: nextPollAt(answer.nextPollHint, now),
    });
    await event(tx, trip, order, 'activity.pending', null);
    return { status: to, bookingId, expenseId: null };
  }
  await moveOrder(tx, order, 'confirmed', {
    voucher_booking_id: bookingId,
    last_polled_at: now,
    next_poll_at: null,
  });
  await asSystemRole(tx, () =>
    tx.query(
      `UPDATE bookings SET status = 'booked',
         details = details || $2::jsonb
       WHERE id = $1`,
      [
        bookingId,
        JSON.stringify(answer.voucher === null ? {} : { notes: `Voucher: ${answer.voucher.url}` }),
      ],
    ),
  );
  let expenseId: string | null = null;
  if (order.total_minor !== null && order.currency !== null) {
    const booking = await asSystemRole(tx, () =>
      tx.query<{ title: string; traveller_ids: string[] }>(
        'SELECT title, traveller_ids FROM bookings WHERE id = $1',
        [bookingId],
      ),
    );
    const row = booking.rows[0];
    expenseId = generateUuidV7();
    await splitBookingExpense(
      tx,
      trip,
      {
        id: bookingId,
        kind: 'activity',
        title: row?.title ?? title,
        priceMinor: BigInt(order.total_minor),
        currency: order.currency,
        paidBy: order.buyer_id,
        travellerIds: row?.traveller_ids ?? [order.buyer_id],
      },
      { expense_id: expenseId },
      order.buyer_id,
      now,
    );
  }
  await event(tx, trip, order, 'activity.booked', bookingId);
  return { status: 'confirmed', bookingId, expenseId };
}

/** The supplier's status read, as the settle step takes it. */
export function answerFrom(status: BookingStatus): {
  readonly outcome: SupplierBookingOutcome;
  readonly title: null;
  readonly voucher: VoucherRef | null;
  readonly rejectionCode: string | null;
  readonly nextPollHint: string | null;
} {
  return {
    outcome: status.status,
    title: null,
    voucher: status.voucher,
    rejectionCode: status.rejectionCode,
    nextPollHint: status.nextPollAt,
  };
}
