/**
 * The draft's travel matrix between places, in the minutes the routed legs staging computes after
 * a draft would show. A pair the routing service has already routed (on any trip to the
 * destination) takes its routed minutes. Any other pair is estimated from the straight line: a
 * walk when it is short enough to be one, else a ride at a rate fitted on staging's routed drive
 * legs (about 2,150 legs in five destinations: 3.5 minutes plus 1.95 a kilometre, the median
 * within 15% and no jump where a city ride becomes a longer one). A place whose routed legs all
 * run slower than that (a summit up a mountain road) carries its own extra minutes into every
 * estimate that touches it. The scheduler, the validator and the redraft's "less travel" number
 * all read the same minutes.
 */
import { metresBetween } from './same-place';
import type { DraftPoi, TravelMatrix } from './types';

/** Minutes of a ride: a fixed start and a rate per straight-line kilometre. */
const RIDE_BASE_MIN = 3.5;
const RIDE_PER_KM_MIN = 1.95;
/** A walk of this straight-line length or less is walked (about 1.2 km on the streets). */
const WALK_MAX_M = 850;
const WALK_PER_KM_MIN = 15.5;
const WALK_MAX_MIN = 15;
/** A place whose routed legs run at least this much over the estimate carries the difference. */
const OFFSET_MIN = 5;
const OFFSET_LEGS = 2;

/** Routed minutes between two places, both ways, keyed by `routedPairKey`. */
export type RoutedPairs = ReadonlyMap<string, number>;

export function routedPairKey(from: string, to: string): string {
  return from < to ? `${from}>${to}` : `${to}>${from}`;
}

/** The estimate for a straight line of `metres`, before any place's own extra minutes. */
export function estimatedMinutes(metres: number): number {
  const walk = (metres / 1000) * WALK_PER_KM_MIN;
  if (metres <= WALK_MAX_M && walk <= WALK_MAX_MIN) return Math.max(1, Math.round(walk));
  return Math.round(RIDE_BASE_MIN + (metres / 1000) * RIDE_PER_KM_MIN);
}

/** Each place's extra minutes: the median of how far its routed legs run over the estimate. */
function placeOffsets(
  pois: ReadonlyMap<string, DraftPoi>,
  routed: RoutedPairs,
): ReadonlyMap<string, number> {
  const over = new Map<string, number[]>();
  for (const [key, minutes] of routed) {
    const [a, b] = key.split('>');
    const from = a === undefined ? undefined : pois.get(a);
    const to = b === undefined ? undefined : pois.get(b);
    if (from === undefined || to === undefined) continue;
    const gap = minutes - estimatedMinutes(metresBetween(from, to));
    for (const id of [from.id, to.id]) over.set(id, [...(over.get(id) ?? []), gap]);
  }
  const offsets = new Map<string, number>();
  for (const [id, gaps] of over) {
    if (gaps.length < OFFSET_LEGS) continue;
    const sorted = [...gaps].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    if (median >= OFFSET_MIN) offsets.set(id, median);
  }
  return offsets;
}

export function straightLineMatrix(
  pois: ReadonlyMap<string, DraftPoi>,
  routed: RoutedPairs = new Map(),
): TravelMatrix {
  const offsets = placeOffsets(pois, routed);
  // Asked for millions of times while a draft is sequenced: one map per place, both directions
  // stored, so a known leg costs two lookups and no string building.
  const cache = new Map<string, Map<string, number>>();
  const row = (id: string) => {
    let found = cache.get(id);
    if (found === undefined) {
      found = new Map();
      cache.set(id, found);
    }
    return found;
  };
  return (from, to) => {
    if (from === to) return 0;
    const known = cache.get(from)?.get(to);
    if (known !== undefined) return known;
    const a = pois.get(from);
    const b = pois.get(to);
    if (a === undefined || b === undefined) return null;
    const minutes =
      routed.get(routedPairKey(from, to)) ??
      estimatedMinutes(metresBetween(a, b)) + (offsets.get(from) ?? 0) + (offsets.get(to) ?? 0);
    row(from).set(to, minutes);
    row(to).set(from, minutes);
    return minutes;
  };
}
