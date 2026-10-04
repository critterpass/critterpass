/**
 * Travel inside a day. A day is planned around one part of the destination; a stop a long ride
 * from the one before it, or a stop that sends the crew out and back between two stops that sit
 * together (a lunch across the island between two museums in town), is a hop too far. How long is
 * too long comes from the destination itself: four times the usual spacing of the places we may
 * plan with, never under forty minutes. One longer ride a day is fine (out to the day's part of
 * the map, or back for dinner), up to twice that; a day trip is where the day is spent, not a
 * detour from it.
 */
import type { DraftPoi, TravelMatrix } from './types';

const MIN_HOP_CAP_MIN = 40;
const MAX_HOP_CAP_MIN = 120;
/** Places sampled for the usual spacing (the head of the list: the ones a draft plans with). */
const SPACING_SAMPLE = 120;

/**
 * The longest ride between two stops that still reads as the same part of the map: four times the
 * median ride from a place to its third-nearest neighbour, kept between forty minutes and two
 * hours.
 */
export function hopCapMin(places: readonly DraftPoi[], travel: TravelMatrix): number {
  const sample = places.slice(0, SPACING_SAMPLE);
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
  return Math.min(MAX_HOP_CAP_MIN, Math.max(MIN_HOP_CAP_MIN, Math.round(median * 4)));
}

export interface Hop {
  /** Index of the stop that is too far in the day's order. */
  readonly index: number;
  /** Minutes over the cap. */
  readonly over: number;
}

/**
 * The stops of a day (in visiting order) that are a hop too far: a detour of more than the cap
 * between two stops that are closer to each other, a ride of more than twice the cap, or a second
 * ride over the cap in one day.
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
  let longRides = 0;
  for (let i = 1; i < poiIds.length; i += 1) {
    const leg = ride(i - 1, i);
    const detour = i + 1 < poiIds.length ? leg + ride(i, i + 1) - ride(i - 1, i + 1) : 0;
    if (detour > capMin) {
      found.push({ index: i, over: Math.round(detour - capMin) });
      continue;
    }
    if (leg <= capMin) continue;
    longRides += 1;
    if (leg > capMin * 2 || longRides > 1) found.push({ index: i, over: Math.round(leg - capMin) });
  }
  return found;
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
