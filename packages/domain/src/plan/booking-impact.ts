/**
 * What a change set does to bookings (3e-3 "1 BOOKING MOVED"): moving or dropping a booked item may
 * mean a reschedule or a cancellation with the supplier. The bookings layer registers a provider
 * that says so per item; a change with any impact needs the organiser's confirmation, and a
 * supplier refusal blocks it. Until a provider is registered nothing is booked through us, so there
 * is no impact.
 */
import type { ChangeSetOp } from './change-set-ops';
import type { ProviderQuery } from './hold-expiry';

export const BOOKING_IMPACT_KINDS = ['reschedule', 'cancel'] as const;
export type BookingImpactKind = (typeof BOOKING_IMPACT_KINDS)[number];

export interface BookingImpact {
  readonly stableId: string;
  readonly bookingId: string;
  readonly kind: BookingImpactKind;
  /** The supplier refuses this change outright: the change set cannot apply. */
  readonly blocked: boolean;
  /** Short template key for the reason shown on the change card. */
  readonly reason: string | null;
}

export interface BookingImpactContext {
  readonly tripId: string;
  readonly ops: readonly ChangeSetOp[];
  /** stable_id → booking id of the touched items that are booked. */
  readonly bookedItems: ReadonlyMap<string, string>;
  readonly query: ProviderQuery;
}

export interface BookingImpactProvider {
  impactOf(context: BookingImpactContext): Promise<readonly BookingImpact[]>;
}

export const NO_BOOKING_IMPACT: BookingImpactProvider = { impactOf: () => Promise.resolve([]) };

let bookingImpactProvider: BookingImpactProvider = NO_BOOKING_IMPACT;

export function registerBookingImpactProvider(provider: BookingImpactProvider): void {
  bookingImpactProvider = provider;
}

export function getBookingImpactProvider(): BookingImpactProvider {
  return bookingImpactProvider;
}
