/**
 * Where a crew most likely sleeps and leaves from, when no stay or station is known: the part of
 * the destination where the places to eat cluster (the middle one of them, by the rides to the
 * rest). The day the crew leaves is planned within reach of it: nobody rides forty minutes out of
 * town at half past one on the day they go home.
 */
import { foodRole } from './food-role';
import { hopCapMin } from './hops';
import type { DraftPoi, TravelMatrix } from './types';

/** Places sampled for the middle, taken evenly across the list. */
const HOME_SAMPLE = 120;
/** With fewer sights than this near home, the last day is not held to it. */
const MIN_NEAR_HOME = 3;

function sampled(places: readonly DraftPoi[]): DraftPoi[] {
  const step = Math.max(1, places.length / HOME_SAMPLE);
  return Array.from(
    { length: Math.min(places.length, HOME_SAMPLE) },
    (_, index) => places[Math.floor(index * step)] as DraftPoi,
  );
}

/** The meal place with the shortest median ride to the others; null with fewer than three. */
export function homeBase(places: readonly DraftPoi[], travel: TravelMatrix): DraftPoi | null {
  const eateries = sampled(places.filter((poi) => foodRole(poi) === 'meal'));
  if (eateries.length < 3) return null;
  let best: { poi: DraftPoi; median: number } | null = null;
  for (const poi of eateries) {
    const rides = eateries
      .filter((other) => other.id !== poi.id)
      .map((other) => travel(poi.id, other.id) ?? Number.POSITIVE_INFINITY)
      .sort((a, b) => a - b);
    const median = rides[Math.floor(rides.length / 2)] ?? Number.POSITIVE_INFINITY;
    if (best === null || median < best.median || (median === best.median && poi.id < best.poi.id)) {
      best = { poi, median };
    }
  }
  return best?.poi ?? null;
}

/**
 * The places a last day may use: those within half of `reachMin` of home (all of it where fewer
 * than three sights are that near). Null when home is unknown or
 * too few sights are near it to make a morning of (the last day is then planned like any other).
 */
export function nearHome(
  places: readonly DraftPoi[],
  travel: TravelMatrix,
  reachMin: number,
  whole = false,
): ReadonlySet<string> | null {
  const home = homeBase(places, travel);
  if (home === null) return null;
  // Half the reach first (a short hop from the door); the whole of it where little is that near,
  // or when asked (`whole`: the day the crew lands has an afternoon, not a morning to pack in).
  for (const reach of whole ? [reachMin] : [Math.round(reachMin / 2), reachMin]) {
    const near = places.filter((poi) => (travel(home.id, poi.id) ?? 0) <= reach);
    const sights = near.filter((poi) => foodRole(poi) === null);
    if (sights.length >= MIN_NEAR_HOME) return new Set(near.map((poi) => poi.id));
  }
  return null;
}

/**
 * Takes the first and the last day off the open days of every place too far from home for them
 * (must-dos aside: `exempt`): the day the crew leaves keeps to a short hop from the door, the day
 * it lands to one ride (no mountain an hour out, straight off the plane). A one-day trip is left.
 */
export function keepEdgeDaysNearHome(
  openDays: Map<string, number[]>,
  places: readonly DraftPoi[],
  travel: TravelMatrix,
  lastDay: number,
  exempt: ReadonlySet<string>,
): void {
  if (lastDay < 2) return;
  const cap = hopCapMin(places, travel);
  const edges = [
    { day: lastDay, near: nearHome(places, travel, cap) },
    { day: 1, near: nearHome(places, travel, cap, true) },
  ];
  for (const { day: edge, near } of edges) {
    if (near === null) continue;
    for (const [poiId, days] of openDays) {
      if (near.has(poiId) || exempt.has(poiId) || !days.includes(edge)) continue;
      const rest = days.filter((day) => day !== edge);
      if (rest.length > 0) openDays.set(poiId, rest);
      else openDays.delete(poiId);
    }
  }
}
