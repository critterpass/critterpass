/**
 * Must-dos in a draft (post-draft): every must-do needs an item, and fixed bookings must not have
 * been moved away from their booked time.
 */
import { type FeasibilityItem, type FixedBooking, type MustDoRef, type Violation } from './types';

export function mustDoViolations(
  items: readonly FeasibilityItem[],
  mustDos: readonly MustDoRef[],
): Violation[] {
  const covered = new Set(items.map((item) => item.mustDoId).filter(Boolean));
  return mustDos
    .filter((mustDo) => !covered.has(mustDo.id))
    .map((mustDo) => ({
      code: 'MUST_DO_MISSING' as const,
      stableId: null,
      mustDoId: mustDo.id,
      uids: [mustDo.ownerId],
    }));
}

export function bookingViolations(
  items: readonly FeasibilityItem[],
  bookings: readonly FixedBooking[],
): Violation[] {
  const byId = new Map(bookings.map((b) => [b.bookingId, b]));
  return items
    .filter((item) => {
      const booking = item.bookingId ? byId.get(item.bookingId) : undefined;
      return (
        booking !== undefined &&
        (booking.startsAt.getTime() !== item.startsAt.getTime() ||
          booking.endsAt.getTime() !== item.endsAt.getTime())
      );
    })
    .map((item) => ({ code: 'BOOKING_MOVED' as const, stableId: item.stableId }));
}
