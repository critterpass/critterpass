/**
 * Booked-not-yet-expensed costs for the trip budget forecast (the money area's `forecast` adds
 * them to actuals and remaining plan items). A booking counts while it is live, booked, priced and
 * no live expense points at it; once someone splits it as an expense the expense counts instead,
 * so nothing is counted twice.
 *
 * The forecast reads them through `BookedCostProvider`, a port the bookings area registers at boot;
 * with none registered the forecast has no booked costs.
 */
import type { BookingKind } from './kinds';

export interface BookedCost {
  readonly bookingId: string;
  readonly kind: BookingKind;
  readonly amountMinor: bigint;
  readonly currency: string;
  /** ISO instant the booking starts, when known (the forecast places it on a day). */
  readonly startsAt: string | null;
}

export interface BookingCostRow {
  readonly id: string;
  readonly kind: BookingKind;
  readonly status: string;
  readonly deleted: boolean;
  readonly priceMinor: bigint | null;
  readonly currency: string | null;
  readonly startsAt: string | null;
}

/** The bookings of a trip that still add to its forecast. */
export function bookedNotYetExpensed(
  bookings: readonly BookingCostRow[],
  expensedBookingIds: ReadonlySet<string>,
): BookedCost[] {
  const costs: BookedCost[] = [];
  for (const booking of bookings) {
    if (booking.deleted || booking.status !== 'booked') continue;
    if (booking.priceMinor === null || booking.currency === null || booking.priceMinor <= 0n) {
      continue;
    }
    if (expensedBookingIds.has(booking.id)) continue;
    costs.push({
      bookingId: booking.id,
      kind: booking.kind,
      amountMinor: booking.priceMinor,
      currency: booking.currency,
      startsAt: booking.startsAt,
    });
  }
  return costs;
}

/** Reads a trip's booked costs inside the caller's transaction (`Tx` is the db client). */
export type BookedCostProvider<Tx> = (tx: Tx, tripId: string) => Promise<readonly BookedCost[]>;

let registered: BookedCostProvider<never> | null = null;

/** Registers the bookings-backed provider (once, at boot); a second registration replaces it. */
export function registerBookedCostProvider<Tx>(provider: BookedCostProvider<Tx>): void {
  registered = provider;
}

/** The registered provider, or null (the forecast then has no booked costs). */
export function getBookedCostProvider<Tx>(): BookedCostProvider<Tx> | null {
  return registered as BookedCostProvider<Tx> | null;
}

/** Test-only: forget the registered provider. */
export function resetBookedCostProviderForTests(): void {
  registered = null;
}
