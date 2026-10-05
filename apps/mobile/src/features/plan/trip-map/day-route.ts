/**
 * A day as a route: the night's stay, the stops with a place in order, and the stay again, as the
 * stored legs are keyed (`stay`, then stable ids). Legs come from the synced plan when the router
 * has worked them out, else "about" straight-line minutes, so they read offline too. An edit makes
 * a new plan version whose legs are routed a little later: until they land, a pair the router has
 * already timed keeps that time, never a longer straight-line guess.
 */
/* eslint-disable lingui/no-unlocalized-strings -- table names, never copy. */
import { useMemo } from 'react';

const LEGS_TABLES = ['plan_legs'];

import {
  dayLegs,
  estimateLeg,
  STAY_LEG_KEY,
  type DayLeg,
  type LegEnd,
  type StoredLeg,
} from '@/data/legs/day-legs';
import type { LegPaths } from '@/data/legs/version-leg-paths';
import { LEGS_SQL } from '@/data/legs/use-day-legs';
import { useLegsPending } from '@/data/legs/use-legs-pending';
import { useLiveRows } from '@/data/plan/live-rows';
import type { RouteDay } from '@/ui/map/planning';

import { mappedStops, type TripDay } from './trip-days';

export interface DayRoute {
  /** Every leg of the day that is known (stored, or estimated between two placed ends). */
  readonly legs: readonly DayLeg[];
  /** The leg after each stop, in the day's stop order; null when it can't be known here. */
  readonly after: readonly (DayLeg | null)[];
  /** The leg from the night's stay to the first stop, and from the last stop back to it. */
  readonly fromStay?: DayLeg | null | undefined;
  readonly toStay?: DayLeg | null | undefined;
}

interface End {
  readonly key: string;
  readonly point: { readonly lat: number; readonly lng: number } | null;
}

/** Routed legs seen so far, by the pair of places they join. */
export type KnownLegs = Map<string, DayLeg>;

const known: KnownLegs = new Map();

/** A pair by its ends and where they are: a stop moved to another place is another pair. */
function pairKey(from: End, to: End): string {
  const at = (end: End) =>
    end.point === null
      ? end.key
      : `${end.key}@${end.point.lat.toFixed(5)},${end.point.lng.toFixed(5)}`;
  return `${at(from)}>${at(to)}`;
}

function routed(leg: DayLeg): boolean {
  return leg.source !== 'straight_line';
}

function endsOf(day: TripDay, order?: readonly string[]): End[] {
  const stops =
    order === undefined
      ? day.stops
      : order.flatMap((id) => day.stops.filter((stop) => stop.stableId === id));
  const ends = stops.map((stop) => ({ key: stop.stableId, point: stop.place }));
  if (day.stay === null || ends.length === 0) return ends;
  const stay = { key: STAY_LEG_KEY, point: day.stay };
  return [stay, ...ends, stay];
}

/**
 * The legs between consecutive ends: the stored leg when the plan has one (even for a stop whose
 * place the phone doesn't hold), else an "about" estimate when both ends are placed, else none.
 */
export function routeOf(
  day: TripDay,
  stored: readonly StoredLeg[],
  order?: readonly string[],
  /** Routed legs seen before (and added to); a pair with no routed leg now reads from it. */
  remembered?: KnownLegs,
  /** The version's legs are on their way: an estimate is marked as standing in for one. */
  pending = false,
): DayRoute {
  const ends = endsOf(day, order);
  const byPair = new Set(stored.map((leg) => `${leg.from_key}>${leg.to_key}`));
  const pairs = ends.slice(1).map((to, index): DayLeg | null => {
    const from = ends[index];
    if (from === undefined) return null;
    const key = pairKey(from, to);
    if (byPair.has(`${from.key}>${to.key}`)) {
      const at = (end: End): LegEnd => ({ key: end.key, lat: 0, lng: 0 });
      const leg = dayLegs([at(from), at(to)], stored)[0] ?? null;
      if (leg !== null && routed(leg)) {
        remembered?.set(key, leg);
        return leg;
      }
      return remembered?.get(key) ?? leg;
    }
    const before = remembered?.get(key);
    if (before !== undefined) return before;
    if (from.point === null || to.point === null) return null;
    const estimate = estimateLeg({ key: from.key, ...from.point }, { key: to.key, ...to.point });
    return pending ? { ...estimate, pending: true } : estimate;
  });
  const offset = day.stay === null || ends.length === 0 ? 0 : 1;
  const count = ends.length - 2 * offset;
  return {
    legs: pairs.filter((leg): leg is DayLeg => leg !== null),
    after: Array.from({ length: Math.max(0, count) }, (_, index) =>
      index === count - 1 ? null : (pairs[index + offset] ?? null),
    ),
    fromStay: offset === 0 ? null : (pairs[0] ?? null),
    toStay: offset === 0 ? null : (pairs[pairs.length - 1] ?? null),
  };
}

/** The legs of `day` in the plan version `versionId`, stored or estimated, read live. */
export function useDayRoute(versionId: string | null, day: TripDay | null): DayRoute {
  const stored = useLiveRows<StoredLeg>(
    LEGS_SQL,
    versionId === null || day?.dayId == null ? null : [versionId, day.dayId],
    LEGS_TABLES,
  );
  const pending = useLegsPending(versionId);
  return useMemo(
    () =>
      day === null ? { legs: [], after: [] } : routeOf(day, stored.rows, undefined, known, pending),
    [day, pending, stored.rows],
  );
}

/** Estimated legs only (a preview of an order that isn't saved yet, or a lab scene). */
export function estimatedRoute(day: TripDay, order?: readonly string[]): DayRoute {
  return routeOf(day, [], order);
}

/**
 * The days as the map's route layer draws them, numbered as the day lists them, along the roads
 * of their synced legs where `legPaths` has them.
 */
export function routeDays(days: readonly TripDay[], legPaths?: LegPaths): RouteDay[] {
  return days.map((day) => ({
    dayNo: day.dayNo,
    color: day.color,
    ...(legPaths === undefined ? {} : { legPaths }),
    stops: mappedStops(day).flatMap(({ n, stop }) =>
      stop.place === null ? [] : [{ id: stop.stableId, n, ...stop.place }],
    ),
  }));
}
