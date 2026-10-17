/**
 * The hours of the day each of a place's best times covers, as itinerary pages mean them (an early
 * morning before half past eight, a sunset from two hours before the real sunset at the place on
 * the day to an hour after it). A stop that starts outside every best time of its place is seen at
 * the wrong time of day.
 */
import type { PlaceBestTime } from '@cp/domain';

import { EARLY_MORNING_ENDS_MIN, sunsetMin } from './time-of-day';
import type { DraftPoi } from './types';

const SPANS: Readonly<Record<Exclude<PlaceBestTime, 'sunset'>, readonly [number, number]>> = {
  early_morning: [300, EARLY_MORNING_ENDS_MIN],
  morning: [420, 690],
  midday: [660, 870],
  afternoon: [810, 1050],
  evening: [1050, 1320],
  after_dark: [1140, 1560],
};
/** A sunset is for the golden hour before the sun goes and no later than an hour after it. */
const SUNSET_BEFORE_MIN = 120;
const SUNSET_AFTER_MIN = 60;

/**
 * Whether a stop at `poi` starting at local minute `startMin` on `date` misses every best time it
 * has.
 */
export function missesBestTime(
  poi: Pick<DraftPoi, 'bestTimes' | 'lat' | 'lng' | 'tz'>,
  startMin: number,
  date: string,
): boolean {
  const times = poi.bestTimes ?? [];
  return (
    times.length > 0 &&
    !times.some((time) => {
      if (time === 'sunset') {
        const sunset = sunsetMin(poi, date);
        return startMin >= sunset - SUNSET_BEFORE_MIN && startMin <= sunset + SUNSET_AFTER_MIN;
      }
      const span = SPANS[time];
      return span !== undefined && startMin >= span[0] && startMin <= span[1];
    })
  );
}
