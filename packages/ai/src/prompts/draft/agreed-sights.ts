/**
 * Agreed sights before dinner. A sight itinerary pages agree on (./agreement) that the draft still
 * lacks gets a seat before dinner on a day whose areas it fits: a day in its own area first, then
 * one beside it, the nearest first. Pages see the museum across town in the afternoon of the day
 * they spend near it, not after dinner (./across-town). It is added where the day has room; else
 * it takes the seat of a stop pages do not agree on that the crew did not ask for and that does
 * not suit its tastes. The day must stay as clean as it was (hours, meals, openers), keep to its
 * areas and dine after the new stop. Evening places are left to ./evenings, cafés and snacks to the
 * meal passes.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import {
  dayWindow,
  foodRole,
  isKept,
  mealsOf,
  minuteOfDate,
  missesBestTime,
  tasteScore,
  type DraftPoi,
} from '@cp/planner';

import { addsAcrossTownAfterDinner, afterDinner } from './across-town';
import { agreementOf, agreementOfStop } from './agreement';
import { areaStep, dayOutOf, rideFrom, spanOf } from './areas';
import { stopBudget } from './budget';
import { addOne, dayFaults, fillMeals, type Attempt } from './complete-days';
import type { DraftPlanInput } from './context';
import { isForEvening } from './evenings';
import { withNearerMeals } from './fill-days';
import { dayShape, offTheirTime, withMealsInDayAreas } from './meal-areas';
import { withMealsOnTheWay } from './meal-detours';
import { misplacedOpeners } from './openers';
import type { SkeletonDay } from './skeleton';

/** Days tried for one sight, nearest first. */
const DAYS_TRIED = 3;

export const placesOf = (day: DraftDay) =>
  day.items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));

/**
 * The agreed sights no day holds: those pages agree on most first, then those that suit the crew,
 * then the most written up.
 */
function agreedLeftOut(input: DraftPlanInput, plan: Itinerary): DraftPoi[] {
  const used = new Set(plan.days.flatMap(placesOf));
  return [...new Set([...input.pools.activities, ...input.pools.sights])]
    .filter(
      (poi) =>
        !used.has(poi.id) &&
        poi.essential !== true &&
        agreementOf(input, poi) < 2 &&
        foodRole(poi) === null &&
        !isForEvening(poi) &&
        spanOf(input, poi) === null,
    )
    .sort(
      (a, b) =>
        agreementOf(input, a) - agreementOf(input, b) ||
        Number(tasteScore(b, input.tastes) > 0) - Number(tasteScore(a, input.tastes) > 0) ||
        (b.blogCount ?? 0) - (a.blogCount ?? 0),
    );
}

/** Where in `day` a stop before dinner goes: in the dinner's seat (so before it), else last. */
export function seatBeforeDinner(input: DraftPlanInput, day: DraftDay): number {
  const dinnerFrom = mealsOf(dayWindow(input.frame, day.day_no - 1)).dinner.startMin;
  const at = day.items.findIndex(
    (item) =>
      item.kind === 'meal' &&
      minuteOfDate(new Date(item.starts_at), day.date, input.frame.tz) >= dinnerFrom - 30,
  );
  return at === -1 ? day.items.length : at;
}

/** Stops of `day` an agreed sight may take the seat of: the last of them first. */
export function fillersOf(input: DraftPlanInput, day: DraftDay): DraftDay['items'] {
  return day.items
    .filter((item) => {
      const poi = input.pois.get(item.poi_id ?? '');
      return (
        poi !== undefined &&
        item.kind !== 'meal' &&
        !isKept(item) &&
        poi.essential !== true &&
        agreementOfStop(input, item) === 2 &&
        foodRole(poi) === null &&
        tasteScore(poi, input.tastes) <= 0 &&
        !afterDinner(input, day, poi.id)
      );
    })
    .reverse();
}

/**
 * `poi` on the day of `outline` at `position`, in the seat of `replacing` when given; null unless
 * the day stays as clean as it was, keeps its shape and has the new stop in its own area.
 */
export function seatKeepingShape(
  input: DraftPlanInput,
  outline: SkeletonDay,
  plan: Itinerary,
  poi: DraftPoi,
  options: {
    readonly position: number;
    readonly replacing?: DraftDay['items'][number];
    /** Whether the new stop may come after dinner (a sight never does). */
    readonly afterDinner?: boolean;
  },
): Itinerary | null {
  const day = plan.days.find((d) => d.day_no === outline.dayNo);
  if (day === undefined) return null;
  const before = dayFaults(input, plan, outline.dayNo);
  const rest =
    options.replacing === undefined
      ? day
      : { ...day, items: day.items.filter((item) => item !== options.replacing) };
  if (rest !== day && areaStep(input, poi.id, placesOf(rest)) > 0) return null;
  // The meals as the day will have them: fed, then moved beside the stops around them.
  const finish = (candidate: Itinerary) =>
    [withNearerMeals, withMealsInDayAreas, withMealsOnTheWay].reduce(
      (plan, pass) => pass(input, outline, plan),
      fillMeals(input, [outline], candidate).itinerary,
    );
  const startOf = (made: DraftDay) => {
    const stop = made.items.find((item) => item.poi_id === poi.id);
    return stop === undefined
      ? -1
      : minuteOfDate(new Date(stop.starts_at), made.date, input.frame.tz);
  };
  // Pages keep a day in one area or two, seen one at a time, each stop at its time of day: the
  // new stop never opens a third area, sends the day back to one it left, or moves a stop off
  // its time.
  const shapeKept = (made: DraftDay) => {
    const [then, now] = [dayShape(input, day), dayShape(input, made)];
    return (
      now.returns <= then.returns &&
      (now.areas <= 2 || now.areas <= then.areas) &&
      offTheirTime(input, made) <= offTheirTime(input, day)
    );
  };
  return addOne(
    input,
    outline,
    rest === day ? plan : { ...plan, days: plan.days.map((d) => (d === day ? rest : d)) },
    [poi],
    (b, after, made) =>
      after.hard <= b.hard &&
      after.meals <= b.meals &&
      misplacedOpeners(input, made).length === 0 &&
      (options.afterDinner === true || !afterDinner(input, made, poi.id)) &&
      !missesBestTime(poi, startOf(made), made.date) &&
      shapeKept(made) &&
      areaStep(input, poi.id, placesOf(made)) === 0 &&
      !addsAcrossTownAfterDinner(input, rest, made),
    `agreed-${outline.dayNo}${options.replacing === undefined ? '' : `-${options.replacing.stable_id}`}`,
    finish,
    before,
    options.position,
  );
}

/** `poi` on the day of `outline`: added, else in a filler's seat; null where neither fits. */
function seatOn(
  input: DraftPlanInput,
  outline: SkeletonDay,
  plan: Itinerary,
  poi: DraftPoi,
): Itinerary | null {
  const day = plan.days.find((d) => d.day_no === outline.dayNo);
  if (day === undefined) return null;
  const window = dayWindow(input.frame, outline.dayNo - 1);
  if (day.items.length < stopBudget(window.endMin - window.startMin)) {
    const added = seatKeepingShape(input, outline, plan, poi, {
      position: seatBeforeDinner(input, day),
    });
    if (added !== null) return added;
  }
  for (const filler of fillersOf(input, day)) {
    const swapped = seatKeepingShape(input, outline, plan, poi, {
      position: day.items.indexOf(filler),
      replacing: filler,
    });
    if (swapped !== null) return swapped;
  }
  return null;
}

/** Gives each agreed sight the draft left out a seat before dinner (see the file note). */
export function placeAgreedSights(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  start: Itinerary,
): Attempt {
  let itinerary = start;
  let added = 0;
  for (const poi of agreedLeftOut(input, start)) {
    const days = outlines
      .flatMap((outline) => {
        const day = itinerary.days.find((d) => d.day_no === outline.dayNo);
        if (day === undefined || day.items.length === 0) return [];
        // A day out (the palaces in the hills) is spent there.
        if (dayOutOf(input, outline.dayNo).size > 0) return [];
        if (!(input.pools.openDays.get(poi.id) ?? []).includes(outline.dayNo)) return [];
        const here = placesOf(day);
        const step = areaStep(input, poi.id, here);
        return step < 1 ? [{ outline, step, ride: rideFrom(input, poi.id, here) }] : [];
      })
      .sort((a, b) => a.step - b.step || a.ride - b.ride)
      .slice(0, DAYS_TRIED);
    for (const { outline } of days) {
      const next = seatOn(input, outline, itinerary, poi);
      if (next === null) continue;
      itinerary = next;
      added += 1;
      break;
    }
  }
  return { itinerary, added };
}
