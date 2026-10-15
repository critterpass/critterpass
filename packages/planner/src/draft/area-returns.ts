/**
 * A day sees one area of the destination at a time: an order that goes back to an area it has
 * already left (lunch across the river between two temples, then back) zigzags, and itinerary
 * pages never lay a day out that way.
 */
import type { DayChoice } from './types';

/** How many times the day, visiting `choices` in `order`, goes back to an area it has left. */
export function areaReturns(
  order: readonly number[],
  choices: readonly DayChoice[],
  areaOf: ((poiId: string) => string | undefined) | undefined,
): number {
  if (areaOf === undefined) return 0;
  const seen = new Set<string>();
  let current: string | undefined;
  let returns = 0;
  for (const index of order) {
    const id = choices[index]?.poiId;
    const area = id === undefined ? undefined : areaOf(id);
    if (area === undefined || area === current) continue;
    if (seen.has(area)) returns += 1;
    seen.add(area);
    current = area;
  }
  return returns;
}
