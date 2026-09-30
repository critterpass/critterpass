/**
 * The planner's fit check for one day, before an add commits and while a block moves: overlaps
 * for the same person and legs too short for the straight-line travel time between two places
 * (the planner's own estimate when no router answer is local).
 */
import { estimateStraightLineEta } from '@cp/domain';
import { checkFeasibility, type FeasibilityItem, type Violation } from '@cp/planner';

import { instantOnDay, type DayItem } from './plan-model';

export type FitWarning = Violation & { readonly code: 'OVERLAP' | 'TRAVEL_TOO_LONG' };

function isWarning(violation: Violation): violation is FitWarning {
  return violation.code === 'OVERLAP' || violation.code === 'TRAVEL_TOO_LONG';
}

export function travelMinutes(items: readonly DayItem[]) {
  const places = new Map(items.map((item) => [item.stableId, item.place]));
  return (from: string, to: string): number | null => {
    const a = places.get(from);
    const b = places.get(to);
    if (a === null || a === undefined || b === null || b === undefined) return null;
    return estimateStraightLineEta({
      originLat: a.lat,
      originLng: a.lng,
      destLat: b.lat,
      destLng: b.lng,
      mode: 'auto',
    }).minutes;
  };
}

/** Warnings for the day's timed items, in the planner's order. */
export function dayFit(
  items: readonly DayItem[],
  date: string,
  members: readonly string[],
): FitWarning[] {
  const timed: FeasibilityItem[] = items.flatMap((item) =>
    item.start === null || item.end === null
      ? []
      : [
          {
            stableId: item.stableId,
            startsAt: new Date(instantOnDay(date, item.start, item.tz)),
            endsAt: new Date(instantOnDay(date, item.end, item.tz)),
            tz: item.tz,
            attendeeIds: item.attendeeIds,
            bookingId: item.bookingId,
          },
        ],
  );
  if (timed.length < 2) return [];
  return checkFeasibility({
    items: timed,
    members,
    travel: travelMinutes(items),
  }).violations.filter(isWarning);
}
