/**
 * The trip countdown (docs/product-decisions.md, countdown target): one target per participant, stored in
 * `trip_participants.countdown_target_at` and read by Home, the trip hub, the widget and the Live
 * Activity alike. The target is the viewer's first outbound departure when their flights are
 * known, otherwise 00:00 of the trip's first day in the destination's zone. The viewer's own zone
 * never moves it: two crewmates in different zones count down to the same instant.
 *
 * Flights reach the recompute job through `FlightSegmentsSource`, a port the bookings feature
 * registers; with no source registered every target is the trip start.
 */
import { Temporal } from '@js-temporal/polyfill';

import { localSchedule } from '../time/local-schedule';

export interface FlightSegment {
  readonly userId: string;
  /** Departure instant, ISO 8601 with offset. */
  readonly departsAt: string;
  /** `outbound` leaves the traveller's home side; returns and hops inside the trip never count. */
  readonly direction: 'outbound' | 'return' | 'internal';
}

export interface CountdownTrip {
  /** `YYYY-MM-DD`, the trip's first day in its own zone. */
  readonly startDate: string | null;
  /** The destination's zone (the trip's `tz`). */
  readonly tz: string | null;
}

/** The countdown target for one participant, or null while the trip has no start date or zone. */
export function countdownTarget(
  userId: string,
  flights: readonly FlightSegment[],
  trip: CountdownTrip,
): Date | null {
  let first: number | null = null;
  for (const segment of flights) {
    if (segment.userId !== userId || segment.direction !== 'outbound') continue;
    const at = Date.parse(segment.departsAt);
    if (Number.isNaN(at)) continue;
    if (first === null || at < first) first = at;
  }
  if (first !== null) return new Date(first);
  if (trip.startDate === null || trip.tz === null) return null;
  return localSchedule({ date: trip.startDate, time: '00:00', tz: trip.tz });
}

/** Reads a trip's flight segments inside the caller's transaction (`Tx` is the db client). */
export type FlightSegmentsSource<Tx> = (
  tx: Tx,
  query: { readonly tripId: string; readonly userIds: readonly string[] },
) => Promise<readonly FlightSegment[]>;

let registered: FlightSegmentsSource<never> | null = null;

/** Registers the bookings-backed source (once, at boot); a second registration replaces it. */
export function registerFlightSegmentsSource<Tx>(source: FlightSegmentsSource<Tx>): void {
  registered = source;
}

/** The registered source, or null (targets then fall back to the trip start). */
export function getFlightSegmentsSource<Tx>(): FlightSegmentsSource<Tx> | null {
  return registered as FlightSegmentsSource<Tx> | null;
}

/** Test-only: forget the registered source. */
export function resetFlightSegmentsSourceForTests(): void {
  registered = null;
}

export type CountdownDisplay =
  | {
      readonly kind: 'counting';
      readonly days: number;
      readonly hours: number;
      readonly minutes: number;
      readonly seconds: number;
    }
  | { readonly kind: 'today' }
  | { readonly kind: 'day'; readonly day: number };

/**
 * What the countdown chip shows at `now`. Before the target it counts down (whole seconds,
 * rounded up so it never shows 0 before the moment); from the target on it shows TODAY on the
 * trip's first day and DAY n after it, both in the destination's zone.
 */
export function formatCountdown(now: Date, target: Date, trip: CountdownTrip): CountdownDisplay {
  const remainingMs = target.getTime() - now.getTime();
  if (remainingMs > 0) {
    const total = Math.ceil(remainingMs / 1000);
    return {
      kind: 'counting',
      days: Math.floor(total / 86_400),
      hours: Math.floor((total % 86_400) / 3600),
      minutes: Math.floor((total % 3600) / 60),
      seconds: total % 60,
    };
  }
  if (trip.startDate === null || trip.tz === null) return { kind: 'today' };
  const today = Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO(trip.tz)
    .toPlainDate();
  const day =
    Temporal.PlainDate.from(trip.startDate).until(today, { largestUnit: 'days' }).days + 1;
  return day <= 1 ? { kind: 'today' } : { kind: 'day', day };
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** The chip's digits: `17D 05:26:47`, or `05:26:47` inside the last day. */
export function countdownDigits(
  display: Extract<CountdownDisplay, { kind: 'counting' }>,
  dayLetter = 'D',
): string {
  const clock = `${pad(display.hours)}:${pad(display.minutes)}:${pad(display.seconds)}`;
  return display.days > 0 ? `${display.days}${dayLetter} ${clock}` : clock;
}
