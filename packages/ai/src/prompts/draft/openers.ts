/**
 * The long outdoor sight that is best early opens its day (the planner's `opensDay`). The order
 * of a day prefers that, but cannot always have it (a breakfast the crew asked for, a day already
 * full). Where such a sight ends up after the day's other sights, it comes off that day: an
 * essential one is then placed on a day it can open (./essentials.ts), another is left to the
 * fills. Better a morning on the mountain another day than an afternoon of cloud on this one.
 */
import type { DraftDay, DraftItem, Itinerary } from '@cp/domain';
import { choicesOfDay, isKept, opensDay, placeIdOf } from '@cp/planner';

import { homeOf, hopCap } from './areas';
import type { DraftPlanInput } from './context';
import { scheduleChoices } from './day';
import type { SkeletonDay } from './skeleton';

/** The day's stops that should open it and do not: a sight of the guide's comes before them. */
export function misplacedOpeners(input: DraftPlanInput, day: DraftDay): DraftItem[] {
  const reach = { homeId: homeOf(input), hopCapMin: hopCap(input), travel: input.travel };
  const opens = (item: DraftItem) => {
    const poi = input.pois.get(placeIdOf(item) ?? '');
    return poi !== undefined && item.kind !== 'meal' && opensDay(poi, reach);
  };
  return day.items.filter((item, index) => {
    if (isKept(item) || !opens(item)) return false;
    return day.items
      .slice(0, index)
      .some((other) => other.kind !== 'meal' && !isKept(other) && !opens(other));
  });
}

/** Takes every misplaced opener off its day and times the rest again. */
export function withoutMisplacedOpeners(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  start: Itinerary,
): Itinerary {
  return {
    ...start,
    days: start.days.map((day) => {
      const gone = new Set(misplacedOpeners(input, day).map((item) => item.stable_id));
      const outline = outlines.find((d) => d.dayNo === day.day_no);
      if (gone.size === 0 || outline === undefined) return day;
      const kept = day.items.filter((item) => !gone.has(item.stable_id));
      const next = scheduleChoices(
        input,
        {
          ...outline,
          mustDoIds: kept.flatMap((item) => (item.must_do_id === null ? [] : [item.must_do_id])),
        },
        choicesOfDay({ items: kept }),
        `openers-${day.day_no}`,
      );
      return { ...next, theme: day.theme };
    }),
  };
}
