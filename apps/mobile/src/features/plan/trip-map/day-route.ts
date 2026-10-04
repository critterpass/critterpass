/**
 * A day as a route: the night's stay, the stops with a place in order, and the stay again, as the
 * stored legs are keyed (`stay`, then stable ids). Legs come from the synced plan when the router
 * has worked them out, else "about" straight-line minutes, so they read offline too.
 */
import { useMemo } from 'react';

import { dayLegs, STAY_LEG_KEY, type DayLeg, type LegEnd } from '@/data/legs/day-legs';
import { useDayLegs } from '@/data/legs/use-day-legs';
import type { RouteDay } from '@/ui/map/planning';

import { mappedStops, type TripDay } from './trip-days';

export interface DayRoute {
  readonly legs: readonly DayLeg[];
  /** The first leg leaves the stay. */
  readonly startsAtStay: boolean;
}

export function dayEnds(day: TripDay, order?: readonly string[]): LegEnd[] {
  const stops = mappedStops(day).map(({ stop }) => stop);
  const ordered =
    order === undefined
      ? stops
      : order.flatMap((id) => stops.filter((stop) => stop.stableId === id));
  const ends = ordered.flatMap((stop) =>
    stop.place === null ? [] : [{ key: stop.stableId, ...stop.place }],
  );
  if (day.stay === null || ends.length === 0) return ends;
  const stay = { key: STAY_LEG_KEY, ...day.stay };
  return [stay, ...ends, stay];
}

/** The legs of `day` in the plan version `versionId`, stored or estimated. */
export function useDayRoute(versionId: string | null, day: TripDay | null): DayRoute {
  const ends = useMemo(() => (day === null ? [] : dayEnds(day)), [day]);
  const read = useDayLegs(versionId, day?.dayId ?? null, ends);
  return useMemo(
    () => ({ legs: read.legs, startsAtStay: day?.stay != null && ends.length > 0 }),
    [read.legs, day?.stay, ends.length],
  );
}

/** Estimated legs only (a preview of an order that isn't saved yet, or a lab scene). */
export function estimatedRoute(day: TripDay, order?: readonly string[]): DayRoute {
  const ends = dayEnds(day, order);
  return { legs: dayLegs(ends, []), startsAtStay: day.stay !== null && ends.length > 0 };
}

/** The days as the map's route layer draws them, numbered as the day lists them. */
export function routeDays(days: readonly TripDay[]): RouteDay[] {
  return days.map((day) => ({
    dayNo: day.dayNo,
    color: day.color,
    stops: mappedStops(day).flatMap(({ n, stop }) =>
      stop.place === null ? [] : [{ id: stop.stableId, n, ...stop.place }],
    ),
  }));
}
