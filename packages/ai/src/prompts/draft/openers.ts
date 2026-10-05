/**
 * The long outdoor sight that is best early opens its day (the planner's `opensDay`). The order
 * of a day prefers that, but cannot always have it (a breakfast the crew asked for, a day already
 * full). Where such a sight ends up after the day's other sights, it comes off that day: an
 * essential one is then placed on a day it can open (./essentials.ts), another is left to the
 * fills. Better a morning on the mountain another day than an afternoon of cloud on this one.
 */
import type { DraftDay, DraftItem, Itinerary } from '@cp/domain';
import {
  choicesOfDay,
  dayWindow,
  earlyNeed,
  isKept,
  minuteOfDate,
  opensDay,
  placeIdOf,
  rankKey,
} from '@cp/planner';

/** A day whose window opens by then has a morning (not the afternoon the crew lands). */
const MORNING_FROM_BY_MIN = 10 * 60 + 30;
/** A place that opens its day starts by then. */
const OPENER_START_BY_MIN = 11 * 60;

import { homeOf, hopCap } from './areas';
import type { DraftPlanInput } from './context';
import { scheduleChoices } from './day';
import type { SkeletonDay } from './skeleton';

/**
 * The day's stops that should open it and do not: a sight of the guide's comes before them, or
 * another place that would open the day has the stronger claim to its morning (the day out it is
 * planned for, then the stronger need to be early, then the longer visit with its ride).
 */
export function misplacedOpeners(input: DraftPlanInput, day: DraftDay): DraftItem[] {
  const home = homeOf(input);
  const reach = { homeId: home, hopCapMin: hopCap(input), travel: input.travel };
  const poiOf = (item: DraftItem) => input.pois.get(placeIdOf(item) ?? '');
  const opens = (item: DraftItem) => {
    const poi = poiOf(item);
    return poi !== undefined && item.kind !== 'meal' && opensDay(poi, reach);
  };
  const claim = (item: DraftItem): number[] => {
    const poi = poiOf(item);
    if (poi === undefined) return [0, Number.NEGATIVE_INFINITY, 0, 0, 0];
    const outing = input.pools.outings.some(
      (o) => o.dayNo === day.day_no && o.poiIds.includes(poi.id),
    );
    const ride = home === null ? 0 : (input.travel(home, poi.id) ?? 0);
    // Our editors' rank first (unranked last), then the day's own outing, then the need.
    return [
      Number(isKept(item)),
      -rankKey(poi),
      Number(outing),
      earlyNeed(poi),
      poi.durationMin + 2 * ride,
    ];
  };
  const stronger = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i += 1) {
      if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
    }
    return false;
  };
  const openers = day.items.filter(opens);
  // On a day with a morning, a place that should open it starts in the morning, not after lunch.
  const dayIndex = input.frame.dates.indexOf(day.date);
  const hasMorning =
    dayIndex >= 0 && dayWindow(input.frame, dayIndex).startMin <= MORNING_FROM_BY_MIN;
  const late = (item: DraftItem) =>
    hasMorning &&
    minuteOfDate(new Date(item.starts_at), day.date, input.frame.tz) > OPENER_START_BY_MIN;
  return day.items.filter((item, index) => {
    if (isKept(item) || !opens(item)) return false;
    if (late(item)) return true;
    const before = day.items
      .slice(0, index)
      .some((other) => other.kind !== 'meal' && !isKept(other) && !opens(other));
    return before || openers.some((other) => other !== item && stronger(claim(other), claim(item)));
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
