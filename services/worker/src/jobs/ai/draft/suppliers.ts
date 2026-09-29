/**
 * The draft's supplier touches, truthful by construction (never merchant of record, no room holds). Stay
 * nights are night blocks priced from our own cost bands ("~$X estimate", never a supplier price),
 * with the affiliate partners a "Book here" click can go to; a free-cancellation date appears only
 * when the crew imported the booking that carries it. Activity slots are checked only through a
 * supplier's availability adapter when its flag is on; with no adapter the draft makes no claim.
 */
import { derivedUuid, type DraftPlanInput } from '@cp/ai';
import type { Itinerary, StayRow } from '@cp/domain';

import type { DraftTripData } from './load';
import { tripDates } from './plan-input';

/** Affiliate partners for stays (Agoda, Trip.com, Booking.com via CJ), all through Travelpayouts. */
export const STAY_PARTNERS = ['agoda', 'trip_com', 'booking_cj'] as const;

/** The trip's stay blocks from its room plan, in order of the nights they cover. */
export function stayRows(trip: DraftTripData): StayRow[] {
  const dates = tripDates(trip);
  const rows: StayRow[] = [];
  let night = 0;
  for (const [index, stay] of (trip.rooms?.stays ?? []).entries()) {
    const checkIn = dates[night] ?? trip.startDate;
    const checkOut = dates[night + stay.nights] ?? trip.endDate;
    rows.push({
      stable_id: derivedUuid(`${trip.tripId}:stay:${index}:${stay.stayType}`),
      stay_type: stay.stayType,
      nights: stay.nights,
      check_in: checkIn,
      check_out: checkOut,
      nightly_pp_minor: stay.nightlyPpMinor,
      currency: trip.currency,
      free_cancel_until:
        trip.rooms?.bookingId === null ? null : (trip.rooms?.freeCancelUntil ?? null),
      booking_id: trip.rooms?.bookingId ?? null,
      partners: trip.rooms?.bookingId === null ? [...STAY_PARTNERS] : [],
    });
    night += stay.nights;
  }
  return rows;
}

/** Stable ids of drafted activities a supplier said have a slot at their planned time. */
export type SlotCheck = (
  trip: DraftTripData,
  itinerary: Itinerary,
  input: DraftPlanInput,
) => Promise<string[]>;

export const noSlotCheck: SlotCheck = () => Promise.resolve([]);
