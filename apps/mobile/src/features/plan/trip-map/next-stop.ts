/**
 * Which stops of a day offer GO in the plan: only while that day is today on the trip's clock (the
 * trip is under way), and only stops with a place that haven't ended yet. The day plan offers all
 * of them; the trip map's sheet offers the first (the stop being visited, else the next). A day
 * planned ahead offers none: the place page has GO for anyone who wants it earlier.
 */
import { toLocalWallTime } from '@cp/domain';

import type { TripDay } from './trip-days';

/** The stable ids of today's stops still to go, in order; empty on any other day. */
export function goStopsToday(day: TripDay, now: Date, tz: string): readonly string[] {
  const wall = toLocalWallTime(now, tz);
  if (day.date === null || day.date !== wall.date) return [];
  const [hours = 0, minutes = 0] = wall.time.split(':').map(Number);
  const nowMinutes = hours * 60 + minutes;
  return day.stops
    .filter((stop) => {
      if (stop.place === null || stop.poiId === null) return false;
      const ends = stop.end ?? stop.start;
      return ends === null || ends > nowMinutes;
    })
    .map((stop) => stop.stableId);
}

/** The one stop the trip map's day sheet offers GO on, or null. */
export function nextGoStop(day: TripDay, now: Date, tz: string): string | null {
  return goStopsToday(day, now, tz)[0] ?? null;
}
