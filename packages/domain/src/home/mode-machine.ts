/**
 * `deriveHomeState`: the Home mode machine, a pure function over synced rows. Precedence, highest
 * first: in trip > final vote > everyday > post trip > no trip > first run. A crew with a trip
 * under way always sees the trip; a final vote outranks the everyday board; a trip that ended in
 * the last two weeks shows its recap only while nothing is coming up.
 */
import { Temporal } from '@js-temporal/polyfill';

import {
  POST_TRIP_HOME_DAYS,
  UPCOMING_TRIP_STATUSES,
  type HomeModeInput,
  type HomeState,
  type HomeTripInput,
} from './home-state';

function byStartDate(a: HomeTripInput, b: HomeTripInput): number {
  if (a.startDate === b.startDate) return a.id.localeCompare(b.id);
  if (a.startDate === null) return 1;
  if (b.startDate === null) return -1;
  return a.startDate.localeCompare(b.startDate);
}

/** Today's calendar date in `tz` (UTC when the trip has no zone yet). */
function todayIn(now: Date, tz: string | null): Temporal.PlainDate {
  return Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO(tz ?? 'UTC')
    .toPlainDate();
}

/** True while a post-trip trip is inside the recap window after its last day. */
export function inPostTripWindow(trip: HomeTripInput, now: Date): boolean {
  if (trip.status !== 'post_trip') return false;
  if (trip.endDate === null) return true;
  const until = Temporal.PlainDate.from(trip.endDate).add({ days: POST_TRIP_HOME_DAYS });
  return Temporal.PlainDate.compare(todayIn(now, trip.tz), until) <= 0;
}

export function deriveHomeState(input: HomeModeInput): HomeState {
  const upcoming = input.trips.filter((trip) => UPCOMING_TRIP_STATUSES.has(trip.status));
  upcoming.sort(byStartDate);
  const nextTrip = upcoming[0] ?? null;
  const activeTrip = input.trips.find((trip) => trip.status === 'in_trip') ?? null;
  const recentTrip = input.trips.find((trip) => inPostTripWindow(trip, input.now)) ?? null;
  const past = input.trips
    .filter((trip) => trip.status === 'post_trip' || trip.status === 'archived')
    .sort(byStartDate);
  const lastTrip = past[past.length - 1] ?? null;
  const base = { nextTrip, activeTrip, recentTrip, lastTrip, vote: input.vote };

  if (activeTrip !== null) return { ...base, mode: 'in_trip' };
  if (input.vote?.stage === 'final') return { ...base, mode: 'final_vote' };
  if (nextTrip !== null || input.vote !== null) return { ...base, mode: 'everyday' };
  if (recentTrip !== null) return { ...base, mode: 'post_trip' };
  if (input.hasCrew || input.trips.length > 0) return { ...base, mode: 'no_trip' };
  return { ...base, mode: 'first_run' };
}
