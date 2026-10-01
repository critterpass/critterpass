/**
 * Whether the location engine may run, and how. It runs only for a trip in `in_trip` on one of its
 * days (or a `pre_trip` trip on its travel day, for leave-by and pickup), and only inside the
 * trip-day window in the trip's own zone. At home it stays off: home is the country of the home
 * airport, and being there while the trip is abroad means the user has not left yet (or is back).
 * The one exception is the explicit, foreground-only "explore at home" opt-in.
 *
 * Countries are compared as ISO 3166-1 alpha-2 codes. Every country that comes in is read through
 * `toCountryCode`, because the catalogue stores some by name ("Vietnam") while the home airport
 * and the geocoder give codes ("VN"); one that cannot be read counts as unknown.
 */
import { toCountryCode } from '../countries/country-code';
import type { TripStatus } from '../enums/trip';
import { toLocalWallTime } from '../time/local-schedule';

export type LocationMode =
  | 'off'
  /** Full trip-day session: encounters, shares, visits, leave-by. */
  | 'trip_day'
  /** Departure day before the trip starts: leave-by and pickup only. */
  | 'travel_day'
  /** At home with the opt-in: foreground only, never a background session. */
  | 'explore_at_home';

export type TripModeReason = 'on' | 'no_trip' | 'not_trip_day' | 'outside_window' | 'at_home';

export interface TripModeTrip {
  readonly status: TripStatus;
  /** `YYYY-MM-DD` in the trip's zone. */
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly tz: string | null;
  /** The destination's country, when known: an ISO 3166-1 alpha-2 code, or its English name. */
  readonly destinationCountry: string | null;
}

export interface TripDayWindow {
  /** Minutes after local midnight the window opens (inclusive). */
  readonly startMinute: number;
  /** Minutes after local midnight the window closes (exclusive); 1440 = midnight. */
  readonly endMinute: number;
}

export const DEFAULT_TRIP_DAY_WINDOW: TripDayWindow = { startMinute: 5 * 60, endMinute: 24 * 60 };

export interface TripModeInput {
  readonly trip: TripModeTrip | null;
  readonly now: Date;
  /** Country of the home airport (code or English name). */
  readonly homeCountry: string | null;
  /** Country the device is in now (reverse-geocoded coarse fix), when known. */
  readonly currentCountry: string | null;
  readonly exploreAtHome: boolean;
  /** Zone used when the trip has none yet (the device zone). */
  readonly deviceTz: string;
  readonly window?: TripDayWindow;
}

export interface TripModeResult {
  readonly mode: LocationMode;
  readonly reason: TripModeReason;
}

/** `HH:MM:SS` → minutes after midnight. */
function minuteOfDay(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function withinDates(date: string, trip: TripModeTrip): boolean {
  if (trip.startDate !== null && date < trip.startDate) return false;
  if (trip.endDate !== null && date > trip.endDate) return false;
  return true;
}

function isAtHome(input: TripModeInput, trip: TripModeTrip): boolean {
  const home = toCountryCode(input.homeCountry);
  const current = toCountryCode(input.currentCountry);
  if (home === null || current === null) return false;
  // A domestic trip happens in the home country; there, "home" cannot mean "not left yet".
  if (toCountryCode(trip.destinationCountry) === home) return false;
  return current === home;
}

export function tripLocationMode(input: TripModeInput): TripModeResult {
  const trip = input.trip;
  if (trip === null || (trip.status !== 'in_trip' && trip.status !== 'pre_trip')) {
    return { mode: 'off', reason: 'no_trip' };
  }
  const local = toLocalWallTime(input.now, trip.tz ?? input.deviceTz);
  const window = input.window ?? DEFAULT_TRIP_DAY_WINDOW;
  const minute = minuteOfDay(local.time);

  if (trip.status === 'pre_trip') {
    if (trip.startDate === null || local.date !== trip.startDate) {
      return { mode: 'off', reason: 'not_trip_day' };
    }
    if (minute < window.startMinute || minute >= window.endMinute) {
      return { mode: 'off', reason: 'outside_window' };
    }
    return { mode: 'travel_day', reason: 'on' };
  }

  if (!withinDates(local.date, trip)) return { mode: 'off', reason: 'not_trip_day' };
  if (minute < window.startMinute || minute >= window.endMinute) {
    return { mode: 'off', reason: 'outside_window' };
  }
  if (isAtHome(input, trip)) {
    return input.exploreAtHome
      ? { mode: 'explore_at_home', reason: 'at_home' }
      : { mode: 'off', reason: 'at_home' };
  }
  return { mode: 'trip_day', reason: 'on' };
}

export function isTripMode(input: TripModeInput): boolean {
  return tripLocationMode(input).mode !== 'off';
}
