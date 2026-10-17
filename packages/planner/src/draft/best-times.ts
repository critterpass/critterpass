/**
 * The hours of the day each of a place's best times covers, as itinerary pages mean them (an early
 * morning before half past eight, a sunset from half past four to half past seven). A stop that
 * starts outside every best time of its place is seen at the wrong time of day.
 */
import type { PlaceBestTime } from '@cp/domain';

import type { DraftPoi } from './types';

/** An early morning is over at half past eight. */
export const EARLY_MORNING_ENDS_MIN = 510;

const SPANS: Readonly<Record<PlaceBestTime, readonly [number, number]>> = {
  early_morning: [300, EARLY_MORNING_ENDS_MIN],
  morning: [420, 690],
  midday: [660, 870],
  afternoon: [810, 1050],
  sunset: [990, 1170],
  evening: [1050, 1320],
  after_dark: [1140, 1560],
};

/** Whether a stop at `poi` starting at local minute `startMin` misses every best time it has. */
export function missesBestTime(poi: Pick<DraftPoi, 'bestTimes'>, startMin: number): boolean {
  const times = poi.bestTimes ?? [];
  return (
    times.length > 0 &&
    !times.some((time) => {
      const span = SPANS[time];
      return span !== undefined && startMin >= span[0] && startMin <= span[1];
    })
  );
}
