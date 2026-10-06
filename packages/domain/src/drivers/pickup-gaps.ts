/**
 * Which plan days need a driver (6a-1): read from the day itself, never from a curated list. A day
 * needs one when it goes far out of town for most of the day, when it comes back late from a place
 * far from the stay (ride apps rarely pick up there at night), or when the destination has no ride
 * app and the day still has real distances between its stops. Deterministic, so every member sees
 * the same card for the same day.
 */
import { distanceM } from '../location/geo';

const distanceKm = (
  a: { readonly lat: number; readonly lng: number },
  b: { readonly lat: number; readonly lng: number },
): number => distanceM(a, b) / 1000;

export interface GapStop {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  /** Local wall time `HH:MM`, or null when the stop has no time. */
  readonly starts: string | null;
  readonly ends: string | null;
}

export interface GapDay {
  readonly date: string;
  readonly stops: readonly GapStop[];
}

export type PickupGapReason = 'day_out' | 'late_return' | 'no_ride_app';

export interface PickupGap {
  readonly date: string;
  readonly reason: PickupGapReason;
  /** The stop the card names (the farthest one). */
  readonly place: string;
  readonly km: number;
  /** The window a driver would cover: first start to last end, when the stops have times. */
  readonly window: { readonly start: string; readonly end: string } | null;
}

/** A day out: a stop this far from the start of the day, over a day this long. */
export const DAY_OUT_KM = 15;
export const DAY_OUT_MIN_HOURS = 6;
/** A late return: a stop this far out that ends at or after this time. */
export const LATE_RETURN_KM = 10;
export const LATE_RETURN_FROM = '20:00';
/** Without a ride app, a leg this long between stops needs a car. */
export const NO_APP_LEG_KM = 3;

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

function windowOf(stops: readonly GapStop[]): PickupGap['window'] {
  const starts = stops.map((s) => s.starts).filter((t): t is string => t !== null);
  const ends = stops.map((s) => s.ends ?? s.starts).filter((t): t is string => t !== null);
  if (starts.length === 0 || ends.length === 0) return null;
  const start = starts.reduce((a, b) => (minutes(b) < minutes(a) ? b : a));
  const end = ends.reduce((a, b) => (minutes(b) > minutes(a) ? b : a));
  return { start, end };
}

/** Hours between two `HH:MM` times (an end before the start runs past midnight). */
export function windowHours(window: { readonly start: string; readonly end: string }): number {
  const span = minutes(window.end) - minutes(window.start);
  return (span < 0 ? span + 24 * 60 : span) / 60;
}

/**
 * The gap on `day`, if any. `home` is where the day starts (the stay); without it the first stop
 * stands in. `hasRideApp` is whether the destination has Grab, Gojek or Uber.
 */
export function pickupGapFor(
  day: GapDay,
  home: { readonly lat: number; readonly lng: number } | null,
  hasRideApp: boolean,
): PickupGap | null {
  const first = day.stops[0];
  if (first === undefined) return null;
  const origin = home ?? first;
  let farthest = first;
  let farKm = 0;
  for (const stop of day.stops) {
    const km = distanceKm(origin, stop);
    if (km > farKm) {
      farKm = km;
      farthest = stop;
    }
  }
  const window = windowOf(day.stops);
  const gap = (reason: PickupGapReason): PickupGap => ({
    date: day.date,
    reason,
    place: farthest.name,
    km: Math.round(farKm),
    window,
  });
  const late = day.stops.some(
    (stop) =>
      distanceKm(origin, stop) >= LATE_RETURN_KM &&
      (stop.ends ?? stop.starts) !== null &&
      minutes((stop.ends ?? stop.starts) as string) >= minutes(LATE_RETURN_FROM),
  );
  if (late) return gap('late_return');
  if (farKm >= DAY_OUT_KM && (window === null || windowHours(window) >= DAY_OUT_MIN_HOURS)) {
    return gap('day_out');
  }
  if (!hasRideApp) {
    for (let i = 1; i < day.stops.length; i += 1) {
      const from = day.stops[i - 1] as GapStop;
      const to = day.stops[i] as GapStop;
      if (distanceKm(from, to) >= NO_APP_LEG_KM) return gap('no_ride_app');
    }
  }
  return null;
}
