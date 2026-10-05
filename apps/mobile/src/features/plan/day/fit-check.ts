/**
 * The straight-line travel time between two of a day's stops (the planner's own estimate when no
 * router answer is local), for timing a stop against the rest of its day.
 */
import { estimateStraightLineEta } from '@cp/domain';
import { type DayItem } from '@/data/plan/plan-model';

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
