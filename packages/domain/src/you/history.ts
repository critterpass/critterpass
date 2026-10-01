/**
 * Travel history (3n-1 stats, 3g-3 crew lines): counts come from in-app trips the user went on
 * plus self-reported past trips. A past trip counts toward TRIPS and COUNTRIES, never toward
 * CRITTERS; "SINCE {year}" is the earlier of `member_since` and the earliest past trip.
 */
import { z } from 'zod';

import { uuidV7Schema } from '../ids';

export interface HistoryTrip {
  readonly id: string;
  /** ISO 3166-1 alpha-2 of the destination, when known. */
  readonly country: string | null;
  /** First day (`YYYY-MM-DD`), when dated. */
  readonly startDate: string | null;
}

export interface HistoryPastTrip {
  readonly id: string;
  readonly country: string;
  /** First of the month (`YYYY-MM-01`). */
  readonly month: string;
  readonly placeId: string | null;
}

export interface TravelHistoryInput {
  /** In-app trips the user went on: RSVP in, trip under way or over. */
  readonly trips: readonly HistoryTrip[];
  readonly pastTrips: readonly HistoryPastTrip[];
  readonly homeCountry: string | null;
  /** Distinct locals in the user's collection. */
  readonly critters: number;
  /** `users.member_since` (`YYYY-MM-DD`). */
  readonly memberSince: string;
}

export interface HistoryStamp {
  readonly kind: 'trip' | 'past_trip';
  readonly id: string;
  readonly country: string | null;
  readonly date: string | null;
  readonly selfReported: boolean;
}

export interface TravelHistory {
  readonly trips: number;
  readonly countries: number;
  readonly critters: number;
  readonly sinceYear: number;
  /** Chronological, oldest first; undated trips last. */
  readonly stamps: readonly HistoryStamp[];
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

export function travelHistory(input: TravelHistoryInput): TravelHistory {
  const countries = new Set<string>();
  if (input.homeCountry !== null) countries.add(input.homeCountry.toUpperCase());
  for (const trip of input.trips)
    if (trip.country !== null) countries.add(trip.country.toUpperCase());
  for (const past of input.pastTrips) countries.add(past.country.toUpperCase());

  const stamps: HistoryStamp[] = [
    ...input.trips.map((trip) => ({
      kind: 'trip' as const,
      id: trip.id,
      country: trip.country,
      date: trip.startDate,
      selfReported: false,
    })),
    ...input.pastTrips.map((past) => ({
      kind: 'past_trip' as const,
      id: past.id,
      country: past.country,
      date: past.month,
      selfReported: true,
    })),
  ].sort((a, b) => {
    if (a.date === b.date) return a.id.localeCompare(b.id);
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date.localeCompare(b.date);
  });

  const earliestPast = input.pastTrips.reduce<number | null>((min, past) => {
    const year = yearOf(past.month);
    return min === null || year < min ? year : min;
  }, null);
  const memberYear = yearOf(input.memberSince);

  return {
    trips: input.trips.length + input.pastTrips.length,
    countries: countries.size,
    critters: input.critters,
    sinceYear: earliestPast !== null && earliestPast < memberYear ? earliestPast : memberYear,
    stamps,
  };
}

const iso3166 = z.string().regex(/^[A-Z]{2}$/, 'must be an ISO 3166-1 alpha-2 code');
/** `YYYY-MM`: a past trip is dated to the month only. */
const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM');

export const addPastTripPayloadSchema = z
  .object({
    past_trip_id: uuidV7Schema,
    place_id: z.uuid().nullable().default(null),
    country: iso3166,
    month: yearMonth,
  })
  .strict();
export type AddPastTripPayload = z.infer<typeof addPastTripPayloadSchema>;

export const removePastTripPayloadSchema = z.object({ past_trip_id: z.uuid() }).strict();
export type RemovePastTripPayload = z.infer<typeof removePastTripPayloadSchema>;
