/**
 * Which stop of a day GO is offered on in the trip map's sheet: today, the next stop still ahead
 * with a place; a day still to come, its first stop with a place; a past day, none.
 */
import { toLocalWallTime } from '@cp/domain';

import type { TripDay } from './trip-days';

export function nextGoStop(day: TripDay, now: Date, tz: string): string | null {
  if (day.date === null) return null;
  const wall = toLocalWallTime(now, tz);
  if (day.date < wall.date) return null;
  const [hours = 0, minutes = 0] = wall.time.split(':').map(Number);
  const today = day.date === wall.date;
  const nowMinutes = hours * 60 + minutes;
  const next = day.stops.find(
    (stop) =>
      stop.place !== null &&
      stop.poiId !== null &&
      (!today || (stop.start !== null && stop.start > nowMinutes)),
  );
  return next?.stableId ?? null;
}
