/**
 * "Split {n} ways" on a booking: its price becomes a crew expense in the same transaction, through
 * the money area's own writer (shares, crew-currency conversion at the pinned FX run, IOUs, the
 * chat card), paid by whoever the booking says paid and split evenly between its travellers unless
 * the caller gave shares. The expense points back at the booking, so the budget forecast counts it
 * once.
 */
import {
  EXPENSE_CATEGORY_OF_KIND,
  type BookingKind,
  type BookingSplit,
  type ExpenseResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { requireInTrip, type BookingTrip } from '../commands/bookings/shared';
import { localDateIn, tripDayOf } from '../commands/money/shared';
import { createExpense, sharesFromSplit } from '../money/expense-writer';

export interface SplitBooking {
  readonly id: string;
  readonly kind: BookingKind;
  readonly title: string;
  readonly priceMinor: bigint;
  readonly currency: string;
  readonly paidBy: string | null;
  readonly travellerIds: readonly string[];
}

export async function splitBookingExpense(
  tx: pg.PoolClient,
  trip: BookingTrip,
  booking: SplitBooking,
  split: BookingSplit,
  uid: string,
  now: Date,
): Promise<ExpenseResult> {
  const payerId = booking.paidBy ?? uid;
  const shares: { user_id: string; weight?: number }[] =
    split.shares ?? booking.travellerIds.map((user_id) => ({ user_id }));
  await requireInTrip(tx, trip.id, [payerId, ...shares.map((share) => share.user_id)]);
  const mode = shares.some((share) => share.weight !== undefined) ? 'weights' : 'equal';
  const localDate = localDateIn(trip.tz, now);
  const result = await createExpense(tx, {
    id: split.expense_id,
    crewId: trip.crew_id,
    tripId: trip.id,
    payerId,
    amountMinor: booking.priceMinor,
    currency: booking.currency,
    fxSnapshotId: split.fx_snapshot_id ?? null,
    crewCurrency: trip.crew_currency,
    splitMode: mode,
    category: EXPENSE_CATEGORY_OF_KIND[booking.kind],
    description: booking.title.slice(0, 140),
    merchant: null,
    spentAt: now,
    localDate,
    tripDay: tripDayOf(trip.start_date, localDate),
    shares: sharesFromSplit(booking.priceMinor, booking.currency, { mode, shares }, payerId),
    createdBy: uid,
    source: 'booking',
    poiId: null,
    receiptId: null,
  });
  await asSystemRole(tx, () =>
    tx.query('UPDATE expenses SET booking_id = $2 WHERE id = $1', [split.expense_id, booking.id]),
  );
  return result;
}
