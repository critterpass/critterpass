/**
 * A place across town from the rest of a day is seen before dinner, never after it. Pages that
 * take a day to the museum on the other side of town do it in the afternoon; nobody rides there
 * at half past eight after dinner, when it is closing or closed. So a stop that takes the day two
 * areas away (`areaStep`) comes before the day's dinner (or, on a day without one, starts before
 * dinner time); where it fits nowhere before dinner, it goes on another day or the day keeps to
 * its areas.
 */
import type { DraftDay } from '@cp/domain';
import { dayWindow, mealsOf, minuteOfDate } from '@cp/planner';

import { areaStep } from './areas';
import type { DraftPlanInput } from './context';

/** Minutes before dinner time from which a meal is the day's dinner (as ./evenings reads it). */
const DINNER_EARLY_MIN = 30;

/** Whether the stop at `poiId` on `day` is across town from the day's other stops. */
export function isAcrossTown(input: DraftPlanInput, day: DraftDay, poiId: string): boolean {
  const here = day.items.flatMap((item) =>
    item.poi_id === null || item.poi_id === poiId ? [] : [item.poi_id],
  );
  return here.length > 0 && areaStep(input, poiId, here) >= 2;
}

/** Whether `day` holds the stop at `poiId` across town from the rest of it after its dinner. */
export function acrossTownAfterDinner(
  input: DraftPlanInput,
  day: DraftDay,
  poiId: string,
): boolean {
  const at = day.items.findIndex((item) => item.poi_id === poiId && item.kind !== 'meal');
  const stop = day.items[at];
  if (stop === undefined || !isAcrossTown(input, day, poiId)) return false;
  const minute = (iso: string) => minuteOfDate(new Date(iso), day.date, input.frame.tz);
  const dinnerFrom = mealsOf(dayWindow(input.frame, day.day_no - 1)).dinner.startMin;
  const dined = day.items.findIndex(
    (item) => item.kind === 'meal' && minute(item.starts_at) >= dinnerFrom - DINNER_EARLY_MIN,
  );
  return dined === -1 ? minute(stop.starts_at) >= dinnerFrom : at > dined;
}

/** Whether `made` holds a stop `was` did not that is across town after dinner. */
export function addsAcrossTownAfterDinner(
  input: DraftPlanInput,
  was: DraftDay | undefined,
  made: DraftDay,
): boolean {
  const before = new Set((was?.items ?? []).map((item) => item.poi_id));
  return made.items.some(
    (item) =>
      item.poi_id !== null &&
      !before.has(item.poi_id) &&
      acrossTownAfterDinner(input, made, item.poi_id),
  );
}
