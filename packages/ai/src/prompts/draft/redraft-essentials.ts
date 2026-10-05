/**
 * The essentials of a redrafted day. A redraft changes one day, and the guide is free to drop a
 * stop for the reasons given; but an essential sight that leaves the day should not leave the
 * trip without a word. So each one the new day lacks is put back on the day when nothing she
 * asked is against it (a surprise keeps the lake it started with); else it goes to another day
 * that takes it as it stands, nothing there giving way; and one no day takes is reported, so the
 * new version says the redraft took it out.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import { alignStableIds, isKept, opensDay, withinReach, type DraftPoi } from '@cp/planner';

import { homeOf, hopCap } from './areas';
import { essentialsOf } from './essentials';
import { placeOne } from './place-essential';
import type { RedraftPlanInput } from './redraft-input';
import { isOutdoors, wantsIndoors } from './redraft-rain';
import type { SkeletonDay } from './skeleton';

export interface EssentialsKept {
  readonly itinerary: Itinerary;
  /** Essentials the redraft took off its day that now sit on another. */
  readonly moved: readonly { readonly poiId: string; readonly dayNo: number }[];
  /** Essentials the redraft took out of the trip: no day had room. */
  readonly leftOut: readonly string[];
}

const placeIds = (day: DraftDay | undefined) =>
  (day?.items ?? []).flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));

/** Whether what she asked for speaks against `poi` staying on the day. */
function askedAgainst(input: RedraftPlanInput, poi: DraftPoi, here: readonly string[]): boolean {
  const reasons = new Set(input.reasons);
  const cap = hopCap(input);
  const reach = { homeId: homeOf(input), hopCapMin: cap, travel: input.travel };
  if (wantsIndoors(input) && isOutdoors(poi)) return true;
  if (reasons.has('swap_it_out')) return true;
  if (reasons.has('later_start') && opensDay(poi, reach)) return true;
  if (reasons.has('cheaper') && (poi.priceLevel ?? 0) >= 2) return true;
  const near = here.length === 0 || withinReach(poi.id, here, input.travel, Math.round(cap / 2));
  return (reasons.has('less_travel') || reasons.has('less_train')) && !near;
}

function outlineOf(day: DraftDay): SkeletonDay {
  return {
    dayNo: day.day_no,
    date: day.date,
    theme: day.theme,
    area: '',
    mustDoIds: day.items.flatMap((item) => (item.must_do_id === null ? [] : [item.must_do_id])),
    poiIds: [],
    mealIds: [],
    spareIds: [],
  };
}

export function keepEssentials(
  input: RedraftPlanInput,
  skeleton: SkeletonDay,
  base: DraftDay,
  start: Itinerary,
): EssentialsKept {
  const essential = new Set(essentialsOf(input).map((poi) => poi.id));
  const dayOf = (plan: Itinerary, dayNo = input.dayNo) => plan.days.find((d) => d.day_no === dayNo);
  const onTrip = (plan: Itinerary) => new Set(plan.days.flatMap((day) => placeIds(day)));
  const was = new Set(placeIds(base));
  const lost = base.items.flatMap((item) => {
    const poi = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
    return poi === undefined || !essential.has(poi.id) || isKept(item) || onTrip(start).has(poi.id)
      ? []
      : [poi];
  });
  let itinerary = start;
  const moved: { poiId: string; dayNo: number }[] = [];
  const leftOut: string[] = [];
  const slower = input.reasons.some((reason) => reason === 'slower' || reason === 'lighter_day');
  for (const poi of lost) {
    const now = dayOf(itinerary);
    const here = placeIds(now);
    if (!askedAgainst(input, poi, here)) {
      // A slower day takes it only in another stop's seat: it may not grow again.
      const back = placeOne(input, [skeleton], itinerary, poi, 0);
      const made = back === null ? undefined : dayOf(back);
      const ids = new Set(placeIds(made));
      const grew = (made?.items.length ?? 0) > (now?.items.length ?? 0);
      // Still a new day: no essential it held gave way, and something on it is new.
      const sound =
        made !== undefined &&
        here.every((id) => !essential.has(id) || ids.has(id)) &&
        [...ids].some((id) => !was.has(id)) &&
        !(slower && grew);
      if (back !== null && sound) {
        itinerary = back;
        continue;
      }
    }
    const others = itinerary.days.filter((day) => day.day_no !== input.dayNo).map(outlineOf);
    const elsewhere = placeOne(input, others, itinerary, poi, 1, true);
    const dayNo = elsewhere?.days.find((day) => placeIds(day).includes(poi.id))?.day_no;
    if (elsewhere === null || dayNo === undefined) {
      leftOut.push(poi.id);
      continue;
    }
    const before = dayOf(itinerary, dayNo);
    // The stop keeps the id it had on the redrafted day: putting that change back on the review
    // screen then takes it off the other day as it returns to its own.
    const own = base.items.find((item) => item.poi_id === poi.id)?.stable_id;
    itinerary = {
      ...elsewhere,
      days: elsewhere.days.map((day) => {
        if (day.day_no !== dayNo || before === undefined) return day;
        const aligned = alignStableIds(before, day);
        return {
          ...aligned,
          items: aligned.items.map((item) =>
            item.poi_id === poi.id && own !== undefined ? { ...item, stable_id: own } : item,
          ),
        };
      }),
    };
    moved.push({ poiId: poi.id, dayNo });
  }
  return { itinerary, moved, leftOut };
}
