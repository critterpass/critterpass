/**
 * Opening hours, evaluated in the place's own zone through `@cp/domain`'s `openAt`: an item is
 * closed-at-time when its place is shut at its start or at its last minute.
 */
import { openAt } from '@cp/domain';

import { type FeasibilityItem, type Violation } from './types';

const MINUTE = 60_000;

export function hoursViolations(items: readonly FeasibilityItem[]): Violation[] {
  return items
    .filter((item) => {
      if (!item.hours) return false;
      const lastMinute = new Date(
        Math.max(item.startsAt.getTime(), item.endsAt.getTime() - MINUTE),
      );
      return (
        !openAt(item.hours, item.tz, item.startsAt) || !openAt(item.hours, item.tz, lastMinute)
      );
    })
    .map((item) => ({ code: 'CLOSED_AT_TIME' as const, stableId: item.stableId }));
}
