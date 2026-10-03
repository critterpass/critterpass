/**
 * Planning travel: walk and drive minutes a plan may store, sync and reuse in background jobs.
 * Answers come from our own Valhalla (OpenStreetMap, ODbL) or, when it is down, unset, or a point
 * is off the road graph, from a straight-line estimate marked `approx` (the app says "about").
 * A Navigation API (Mapbox Directions or Matrix) is never a source here: their terms forbid
 * storing results, so the result type only admits `valhalla` and `straight_line`.
 *
 * Valhalla runs free-flow (no traffic); `travel-modes.ts` applies the destination's drive factor.
 */
import { estimateStraightLineEta } from '@cp/domain';

import type { ValhallaClient, ValhallaCosting, ValhallaPoint } from './client';
import { routeCacheKey, type CachedTravel, type RouteCache } from './route-cache';

export type PlanningTravelMode = 'walk' | 'drive';

export interface PlanningTravelResult {
  readonly minutes: number;
  readonly meters: number;
  readonly source: 'valhalla' | 'straight_line';
  /** A straight-line estimate: the app prefixes "about". */
  readonly approx: boolean;
  /** Safe to store and sync: never a Navigation API result. */
  readonly storable: true;
}

export interface PlanningTravel {
  travel(
    from: ValhallaPoint,
    to: ValhallaPoint,
    mode: PlanningTravelMode,
  ): Promise<PlanningTravelResult>;
  /** `result[i][j]` from source i to destination j. */
  matrix(
    sources: readonly ValhallaPoint[],
    destinations: readonly ValhallaPoint[],
    mode: PlanningTravelMode,
  ): Promise<PlanningTravelResult[][]>;
}

export interface PlanningTravelOptions {
  /** `null` when no router is configured: every answer is a straight-line estimate. */
  readonly valhalla: ValhallaClient | null;
  readonly cache?: RouteCache;
  readonly onError?: (error: unknown) => void;
}

const COSTING: Readonly<Record<PlanningTravelMode, ValhallaCosting>> = {
  walk: 'pedestrian',
  drive: 'auto',
};

/** Whole minutes; a leg that moves at all takes at least one. */
export function toMinutes(seconds: number, meters: number): number {
  const minutes = Math.round(seconds / 60);
  return meters > 0 ? Math.max(1, minutes) : minutes;
}

export function straightLineTravel(
  from: ValhallaPoint,
  to: ValhallaPoint,
  mode: PlanningTravelMode,
): PlanningTravelResult {
  if (from.lat === to.lat && from.lng === to.lng) {
    return { minutes: 0, meters: 0, source: 'straight_line', approx: true, storable: true };
  }
  const eta = estimateStraightLineEta(
    {
      originLat: from.lat,
      originLng: from.lng,
      destLat: to.lat,
      destLng: to.lng,
      mode: mode === 'walk' ? 'pedestrian' : 'auto',
    },
    'provider_unavailable',
  );
  return {
    minutes: eta.minutes,
    meters: eta.distanceM,
    source: 'straight_line',
    approx: true,
    storable: true,
  };
}

const routed = (minutes: number, meters: number): PlanningTravelResult => ({
  minutes,
  meters,
  source: 'valhalla',
  approx: false,
  storable: true,
});

export function createPlanningTravel(options: PlanningTravelOptions): PlanningTravel {
  const { valhalla, cache } = options;

  /** A cache outage costs a router call, never the answer. */
  async function readCache(keys: readonly string[]): Promise<Map<string, CachedTravel>> {
    if (cache === undefined || valhalla === null) return new Map();
    try {
      return await cache.get(keys);
    } catch (error) {
      options.onError?.(error);
      return new Map();
    }
  }

  async function matrix(
    sources: readonly ValhallaPoint[],
    destinations: readonly ValhallaPoint[],
    mode: PlanningTravelMode,
  ): Promise<PlanningTravelResult[][]> {
    const keys = sources.map((from) => destinations.map((to) => routeCacheKey(from, to, mode)));
    const cached = await readCache(keys.flat());
    const result: (PlanningTravelResult | undefined)[][] = keys.map((row) =>
      row.map((key) => {
        const hit = cached.get(key);
        return hit === undefined ? undefined : routed(hit.minutes, hit.meters);
      }),
    );
    // Rows with any miss go to the router together, against every destination.
    const missingRows = sources.flatMap((_, i) => (result[i]?.includes(undefined) ? [i] : []));
    if (valhalla !== null && missingRows.length > 0) {
      try {
        const answer = await valhalla.matrix(
          missingRows.map((i) => sources[i] as ValhallaPoint),
          destinations,
          COSTING[mode],
        );
        const fresh: { key: string; minutes: number; meters: number }[] = [];
        missingRows.forEach((i, row) => {
          destinations.forEach((_, j) => {
            const seconds = answer.seconds[row]?.[j];
            const meters = answer.meters[row]?.[j];
            if (seconds == null || meters == null || result[i]?.[j] !== undefined) return;
            const minutes = toMinutes(seconds, meters);
            const cells = result[i];
            if (cells !== undefined) cells[j] = routed(minutes, meters);
            fresh.push({ key: keys[i]?.[j] as string, minutes, meters });
          });
        });
        if (cache !== undefined && fresh.length > 0) {
          await cache.put(fresh).catch((error: unknown) => options.onError?.(error));
        }
      } catch (error) {
        options.onError?.(error);
      }
    }
    return result.map((row, i) =>
      row.map(
        (cell, j) =>
          cell ??
          straightLineTravel(sources[i] as ValhallaPoint, destinations[j] as ValhallaPoint, mode),
      ),
    );
  }

  return {
    async travel(from, to, mode) {
      const [row] = await matrix([from], [to], mode);
      return row?.[0] ?? straightLineTravel(from, to, mode);
    },
    matrix,
  };
}
