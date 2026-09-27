/** Plan items sit on a 15-minute grid in their own local time (so +05:45 zones work too). */
import { toLocalWallTime } from '@cp/domain';

import { type FeasibilityItem, type Violation } from './types';

/** Minute of the local day for `at` in `tz`. */
export function localMinute(at: Date, tz: string): number {
  const [hour = 0, minute = 0] = toLocalWallTime(at, tz).time.split(':').map(Number);
  return hour * 60 + minute;
}

export function gridViolations(items: readonly FeasibilityItem[], gridMin: number): Violation[] {
  return items
    .filter((item) => {
      const secondsOff = item.startsAt.getUTCSeconds() !== 0 || item.endsAt.getUTCSeconds() !== 0;
      return (
        secondsOff ||
        localMinute(item.startsAt, item.tz) % gridMin !== 0 ||
        localMinute(item.endsAt, item.tz) % gridMin !== 0
      );
    })
    .map((item) => ({ code: 'OFF_GRID' as const, stableId: item.stableId }));
}
