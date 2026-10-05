/**
 * Where today is in a day's plan, on the trip's clock: which stops are over, which one is on now
 * and which is next, and the one stop that offers GO (the stop being visited, else the next one
 * with a place; never a stop this person skips). A day planned ahead offers none: the place page
 * has GO for anyone who wants it earlier.
 */
import { toLocalWallTime } from '@cp/domain';
import { useEffect, useState } from 'react';

import type { TripDay } from './trip-days';

/** Today's date on the trip's clock (`YYYY-MM-DD`). */
export function todayOf(now: Date, tz: string): string {
  return toLocalWallTime(now, tz).date;
}

/** What she said herself at a stop of today, by stable id: she is there, or she is done there. */
export type SaidStops = ReadonlyMap<string, 'here' | 'done'>;

const NOTHING_SAID: SaidStops = new Map();

/**
 * The stable ids of today's stops still to go, in order; empty on any other day. A stop she marked
 * done is over whatever the clock says.
 */
export function goStopsToday(
  day: TripDay,
  now: Date,
  tz: string,
  said: SaidStops = NOTHING_SAID,
): readonly string[] {
  const wall = toLocalWallTime(now, tz);
  if (day.date === null || day.date !== wall.date) return [];
  const [hours = 0, minutes = 0] = wall.time.split(':').map(Number);
  const nowMinutes = hours * 60 + minutes;
  return day.stops
    .filter((stop) => {
      if (stop.place === null || stop.poiId === null) return false;
      if (day.personal?.get(stop.stableId) === 'skipping') return false;
      if (said.get(stop.stableId) === 'done') return false;
      const ends = stop.end ?? stop.start;
      return ends === null || ends > nowMinutes;
    })
    .map((stop) => stop.stableId);
}

/** The one stop the trip map's day sheet offers GO on, or null. */
export function nextGoStop(
  day: TripDay,
  now: Date,
  tz: string,
  said: SaidStops = NOTHING_SAID,
): string | null {
  return goStopsToday(day, now, tz, said)[0] ?? null;
}

export type StopMoment = 'done' | 'now' | 'next';

export interface DayProgress {
  /** Minutes after the day's local midnight, now. */
  readonly nowMinutes: number;
  /** Each stop of today that is over, on now, or the next to come; later stops have no entry. */
  readonly moments: ReadonlyMap<string, StopMoment>;
}

/**
 * Where `now` falls in `day`; null on any day that is not today on the trip's clock. What she said
 * goes before the clock: a stop she marked done is over (the next one becomes next, even early),
 * and a stop she said she is at is on now.
 */
export function dayProgress(
  day: TripDay,
  now: Date,
  tz: string,
  said: SaidStops = NOTHING_SAID,
): DayProgress | null {
  const wall = toLocalWallTime(now, tz);
  if (day.date === null || day.date !== wall.date) return null;
  const [hours = 0, minutes = 0] = wall.time.split(':').map(Number);
  const nowMinutes = hours * 60 + minutes;
  const moments = new Map<string, StopMoment>();
  let next = false;
  for (const stop of day.stops) {
    if (stop.start === null) continue;
    const end = stop.end ?? stop.start;
    const word = said.get(stop.stableId);
    if (word === 'done' || end <= nowMinutes) moments.set(stop.stableId, 'done');
    else if (word === 'here' || stop.start <= nowMinutes) moments.set(stop.stableId, 'now');
    else if (!next && day.personal?.get(stop.stableId) !== 'skipping') {
      moments.set(stop.stableId, 'next');
      next = true;
    }
  }
  return { nowMinutes, moments };
}

/**
 * The clock a plan screen reads today against: the model's fixed one (a lab scene), else the
 * phone's, moving once a minute so NOW, the ticks and GO keep up while the screen stays open.
 */
export function usePlanClock(fixed: Date | undefined): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (fixed !== undefined) return undefined;
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [fixed]);
  return fixed ?? now;
}
