/**
 * Travel inside a day. A day is planned around one part of the destination; a stop a long ride
 * from the one before it, or a stop that sends the crew out and back between two stops that sit
 * together (a lunch across the island between two museums in town), is a hop too far. How long is
 * too long comes from the destination itself: three times the usual spacing of the places we may
 * plan with, never under forty minutes. The ride to the day's first stop is not a hop: a day trip
 * is where the day is spent, not a detour from it. And the rides of a day together stay under a
 * road budget (twice the cap, never under two hours): a day of rides that each pass is still a
 * day spent on the road.
 */
import type { DraftPoi, TravelMatrix } from './types';

const MIN_HOP_CAP_MIN = 40;
const MAX_HOP_CAP_MIN = 120;
const MIN_ROAD_BUDGET_MIN = 120;

/** The most minutes a day's rides between its stops may add up to. */
export function roadBudgetMin(capMin: number): number {
  return Math.max(MIN_ROAD_BUDGET_MIN, capMin * 2);
}
/** Places sampled for the usual spacing, taken evenly across the list. */
const SPACING_SAMPLE = 150;

/**
 * The longest ride between two stops that still reads as the same part of the map: three times the
 * median ride from a place to its third-nearest neighbour, kept between forty minutes and two
 * hours.
 */
export function hopCapMin(places: readonly DraftPoi[], travel: TravelMatrix): number {
  const step = Math.max(1, places.length / SPACING_SAMPLE);
  const sample = Array.from(
    { length: Math.min(places.length, SPACING_SAMPLE) },
    (_, index) => places[Math.floor(index * step)] as DraftPoi,
  );
  if (sample.length < 4) return MAX_HOP_CAP_MIN;
  const thirds = sample
    .map((place) => {
      const rides = sample
        .filter((other) => other.id !== place.id)
        .map((other) => travel(place.id, other.id))
        .filter((minutes): minutes is number => minutes !== null)
        .sort((a, b) => a - b);
      return rides[Math.min(2, rides.length - 1)];
    })
    .filter((minutes): minutes is number => minutes !== undefined)
    .sort((a, b) => a - b);
  const median = thirds[Math.floor(thirds.length / 2)] ?? MIN_HOP_CAP_MIN;
  return Math.min(MAX_HOP_CAP_MIN, Math.max(MIN_HOP_CAP_MIN, Math.round(median * 3)));
}

export interface Hop {
  /** Index of the stop that is too far in the day's order. */
  readonly index: number;
  /** Minutes over the cap. */
  readonly over: number;
}

/**
 * The stops of a day (in visiting order) that are a hop too far: a detour of more than the cap
 * between two stops that are closer to each other, or a ride of more than the cap. When the rides
 * left still add up to more than the road budget, the stops that cost the most riding are too far
 * as well, until the rest fits.
 */
export function longHops(
  poiIds: readonly (string | null)[],
  travel: TravelMatrix,
  capMin: number,
): Hop[] {
  const ride = (a: number, b: number): number => {
    const from = poiIds[a];
    const to = poiIds[b];
    return from == null || to == null ? 0 : (travel(from, to) ?? 0);
  };
  const found: Hop[] = [];
  for (let i = 1; i < poiIds.length; i += 1) {
    const leg = ride(i - 1, i);
    const detour = i + 1 < poiIds.length ? leg + ride(i, i + 1) - ride(i - 1, i + 1) : 0;
    if (detour > capMin) {
      found.push({ index: i, over: Math.round(detour - capMin) });
      continue;
    }
    if (leg > capMin) found.push({ index: i, over: Math.round(leg - capMin) });
  }
  return [
    ...found,
    ...overBudget(poiIds.length, ride, new Set(found.map((hop) => hop.index)), capMin),
  ];
}

/** The stops to leave out, costliest detour first, until the day's rides fit the road budget. */
function overBudget(
  count: number,
  ride: (a: number, b: number) => number,
  gone: ReadonlySet<number>,
  capMin: number,
): Hop[] {
  const budget = roadBudgetMin(capMin);
  const kept = Array.from({ length: count }, (_, index) => index).filter((i) => !gone.has(i));
  const found: Hop[] = [];
  for (;;) {
    const total = kept.reduce(
      (sum, stop, at) => (at === 0 ? 0 : sum + ride(kept[at - 1] ?? stop, stop)),
      0,
    );
    if (total <= budget || kept.length < 3) return found;
    let worst = 1;
    let saved = -1;
    for (let at = 1; at < kept.length; at += 1) {
      const [before, stop, after] = [kept[at - 1], kept[at], kept[at + 1]];
      if (before === undefined || stop === undefined) continue;
      const detour =
        ride(before, stop) + (after === undefined ? 0 : ride(stop, after) - ride(before, after));
      if (detour > saved) [worst, saved] = [at, detour];
    }
    found.push({ index: kept[worst] as number, over: Math.round(total - budget) });
    kept.splice(worst, 1);
  }
}

/** Whether `poiId` is within the cap of at least one of `others` (true when there are none). */
export function withinReach(
  poiId: string,
  others: readonly string[],
  travel: TravelMatrix,
  capMin: number,
): boolean {
  const rest = others.filter((other) => other !== poiId);
  if (rest.length === 0) return true;
  return rest.some((other) => (travel(other, poiId) ?? 0) <= capMin);
}
