/**
 * Travel inside a day. A day is planned around one part of the destination; a stop a long ride
 * from the one before it, or a stop that sends the crew out and back between two stops that sit
 * together (a lunch across the island between two museums in town), is a hop too far. How long is
 * too long comes from the destination itself: three times the usual spacing of the places we may
 * plan with, never under forty minutes. One longer ride a day is fine (a morning out at the
 * peninsula, then back to town for lunch and the afternoon), up to half as long again; a second
 * one makes a day of zigzags. The ride out to the day's first stop counts as that one longer ride
 * when home is known: a day trip is where the day is spent, and it is not left for another far
 * place. Nor is the ride home to dinner at the end of a day out
 * where no dinner place is near (up to two hours): the crew goes back to town to eat. And the rides of a day
 * together, those two aside, stay under a road budget (twice the cap, never under two hours): a
 * day of rides that each pass is still a day spent on the road.
 */
import type { DraftPoi, TravelMatrix } from './types';

const MIN_HOP_CAP_MIN = 40;
const MAX_HOP_CAP_MIN = 120;
const MIN_ROAD_BUDGET_MIN = 120;
/** The longest ride home to dinner. */
export const RIDE_HOME_MAX_MIN = 120;
/** The one longer ride a day may have, as a share of the cap. */
const LONG_RIDE_SHARE = 1.5;

/** The longest the day's one longer ride may be. */
export function longRideMin(capMin: number): number {
  return Math.round(capMin * LONG_RIDE_SHARE);
}

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
 * between two stops that are closer to each other, a ride longer than the day's one long ride may
 * be, or a second ride over the cap. When the rides left still add up to more than the road
 * budget, the stops that cost the most riding are too far as well, until the rest fits.
 * `dinnerAt` is the index of a dinner that is a ride home (`dinnerIsRideHome`): the ride to it
 * is held only to `RIDE_HOME_MAX_MIN`. `homeId` is where the crew sleeps (./home): the ride out
 * to the first stop then counts as the day's one longer ride, and the ride back to town after a
 * day out is held like the ride home.
 */
export function longHops(
  poiIds: readonly (string | null)[],
  travel: TravelMatrix,
  capMin: number,
  dinnerAt?: number,
  homeId?: string | null,
): Hop[] {
  const between = (a: number, b: number): number => {
    const from = poiIds[a];
    const to = poiIds[b];
    return from == null || to == null ? 0 : (travel(from, to) ?? 0);
  };
  // After a day out, the first ride over the cap that ends back near home is the way back to
  // town: like the ride home to dinner, it is no part of the day's riding about.
  const nearHome = (index: number): boolean => {
    const id = poiIds[index];
    return homeId != null && id != null && (travel(homeId, id) ?? 0) <= capMin;
  };
  let backAt: number | undefined;
  for (let i = 1; i < poiIds.length && backAt === undefined; i += 1) {
    if (i !== dinnerAt && between(i - 1, i) > capMin && nearHome(i) && !nearHome(i - 1)) backAt = i;
  }
  const home = (index: number) => index === dinnerAt || index === backAt;
  const ride = (a: number, b: number): number => (home(b) ? 0 : between(a, b));
  const found: Hop[] = [];
  let longRides = 0;
  // The ride out from where the crew sleeps is the day's long ride when it is over the cap (the
  // day then stays where it went), and never longer than the ride home may be.
  const first = poiIds[0];
  const out = homeId == null || first == null ? 0 : (travel(homeId, first) ?? 0);
  if (out > RIDE_HOME_MAX_MIN) found.push({ index: 0, over: Math.round(out - capMin) });
  else if (out > capMin) longRides += 1;
  for (let i = 1; i < poiIds.length; i += 1) {
    if (home(i)) {
      // Home to dinner may be a long way; back to town in the middle of a day, the long ride's.
      const back = between(i - 1, i);
      const most = i === dinnerAt ? RIDE_HOME_MAX_MIN : longRideMin(capMin);
      if (back > most) found.push({ index: i, over: Math.round(back - capMin) });
      continue;
    }
    const leg = ride(i - 1, i);
    const detour = i + 1 < poiIds.length ? leg + ride(i, i + 1) - ride(i - 1, i + 1) : 0;
    if (detour > capMin) {
      found.push({ index: i, over: Math.round(detour - capMin) });
      continue;
    }
    if (leg <= capMin) continue;
    longRides += 1;
    if (leg > longRideMin(capMin) || longRides > 1) {
      found.push({ index: i, over: Math.round(leg - capMin) });
    }
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

/**
 * Whether the day's dinner is a ride home: no place that serves dinner is within the day's one
 * longer ride of the stops before it, so the crew eats where it rides back to.
 */
export function dinnerIsRideHome(
  before: readonly string[],
  dinnerPlaces: readonly DraftPoi[],
  travel: TravelMatrix,
  capMin: number,
): boolean {
  if (before.length === 0) return false;
  const reach = longRideMin(capMin);
  return !dinnerPlaces.some((place) =>
    before.some((stop) => stop !== place.id && (travel(stop, place.id) ?? 0) <= reach),
  );
}
