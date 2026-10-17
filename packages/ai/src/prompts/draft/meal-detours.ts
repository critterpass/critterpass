/**
 * Meals on the way. Itinerary pages eat a street or two from the sights around a meal; a lunch
 * two kilometres off the line between the morning's last sight and the afternoon's first is a
 * ride out and back, even inside one named area. A meal that far out of the day's way gives way to
 * a place nearer that line, when one serves the meal that day, and the day then walks less and is
 * no worse in any other way: no rule broken, no meal lost, no stop off its time of day or out of
 * the place it opens the day, no return to an area it has left. A meal the crew asked for or
 * placed stays; one itinerary pages agree on (./agreement) gives way only to another they agree
 * on, and one that suits the crew's tastes only to another that suits them.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import {
  dayWindow,
  isKept,
  mealSlots,
  mealsOf,
  metresBetween,
  minuteOfDate,
  sameDish,
  tasteScore,
  type DraftPoi,
} from '@cp/planner';

import { agreementOf, isAgreed } from './agreement';
import { dayFaults } from './complete-days';
import type { DraftPlanInput } from './context';
import { aroundMeal, dayShape, offTheirTime, withMealAt } from './meal-areas';
import { misplacedOpeners } from './openers';
import type { SkeletonDay } from './skeleton';

/** A meal this many metres out of the day's way is worth moving. */
export const DETOUR_M = 1_000;
/** A place for it must cut the day's walk by at least this much. */
const SAVING_M = 500;
/** Places tried for one meal. */
const TRIED = 6;

type Point = { readonly lat: number; readonly lng: number };

/** Metres the day goes out of its way to reach `poi` from the stops around it and back. */
function detourOf(poi: Point, around: readonly Point[]): number {
  const [before, after] = around;
  if (before === undefined) return 0;
  if (after === undefined) return metresBetween(before, poi);
  return metresBetween(before, poi) + metresBetween(poi, after) - metresBetween(before, after);
}

/** Straight-line metres from stop to stop, as a day's walk is measured. */
export function dayMetres(input: DraftPlanInput, day: DraftDay): number {
  const points = day.items.flatMap((item) => input.pois.get(item.poi_id ?? '') ?? []);
  let metres = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a !== undefined && b !== undefined) metres += metresBetween(a, b);
  }
  return metres;
}

/** Places nearer the day's way that could serve the meal at `at`, best first. */
function nearerFor(
  input: DraftPlanInput,
  itinerary: Itinerary,
  day: DraftDay,
  at: number,
  current: DraftPoi,
  around: readonly Point[],
): DraftPoi[] {
  const item = day.items[at];
  if (item === undefined) return [];
  const window = dayWindow(input.frame, day.day_no - 1);
  const start = minuteOfDate(new Date(item.starts_at), day.date, input.frame.tz);
  const slot = start >= mealsOf(window).dinner.startMin - 90 ? 'dinner' : 'lunch';
  const used = new Set(itinerary.days.flatMap((d) => d.items.map((i) => i.poi_id)));
  const otherMeals = itinerary.days
    .filter((d) => Math.abs(d.day_no - day.day_no) <= 1)
    .flatMap((d) =>
      d.items.flatMap((i) => {
        const poi = i === item || i.kind !== 'meal' ? undefined : input.pois.get(i.poi_id ?? '');
        return poi === undefined ? [] : [poi];
      }),
    );
  const limit = detourOf(current, around) - SAVING_M;
  const suits = tasteScore(current, input.tastes) > 0;
  return input.pools.eateries
    .filter(
      (poi) =>
        !used.has(poi.id) &&
        (!isAgreed(input, current) || isAgreed(input, poi)) &&
        (!suits || tasteScore(poi, input.tastes) > 0) &&
        (input.pools.openDays.get(poi.id) ?? []).includes(day.day_no) &&
        mealSlots(poi, day.date).includes(slot) &&
        !otherMeals.some((other) => sameDish(other, poi)),
    )
    .map((poi, rank) => ({ poi, rank, detour: detourOf(poi, around) }))
    .filter((entry) => entry.detour <= limit)
    .sort(
      (a, b) =>
        agreementOf(input, a.poi) - agreementOf(input, b.poi) ||
        tasteScore(b.poi, input.tastes) - tasteScore(a.poi, input.tastes) ||
        a.detour - b.detour ||
        a.rank - b.rank,
    )
    .slice(0, TRIED)
    .map((entry) => entry.poi);
}

/** See the file note: each meal of the outline's day on the day's way, where a place allows. */
export function withMealsOnTheWay(
  input: DraftPlanInput,
  outline: SkeletonDay,
  start: Itinerary,
): Itinerary {
  let itinerary = start;
  const dayOf = (plan: Itinerary) => plan.days.find((d) => d.day_no === outline.dayNo);
  for (const meal of (dayOf(start)?.items ?? []).filter((item) => item.kind === 'meal')) {
    const day = dayOf(itinerary);
    const at = day?.items.findIndex((item) => item.stable_id === meal.stable_id) ?? -1;
    if (day === undefined || at === -1 || isKept(meal) || meal.poi_id === null) continue;
    const poi = input.pois.get(meal.poi_id);
    const around = aroundMeal(day, at).flatMap((id) => input.pois.get(id) ?? []);
    if (poi === undefined || detourOf(poi, around) <= DETOUR_M) continue;
    const before = dayFaults(input, itinerary, outline.dayNo);
    const shape = dayShape(input, day);
    const opened = misplacedOpeners(input, day).length;
    const off = offTheirTime(input, day);
    const walk = dayMetres(input, day);
    for (const candidate of nearerFor(input, itinerary, day, at, poi, around)) {
      const next = withMealAt(input, outline, itinerary, day, at, candidate);
      const made = dayOf(next);
      if (made === undefined || made.items.length !== day.items.length) continue;
      if (!made.items.some((item) => item.poi_id === candidate.id && item.kind === 'meal')) {
        continue;
      }
      const after = dayFaults(input, next, outline.dayNo);
      if (
        after.hard <= before.hard &&
        after.meals <= before.meals &&
        misplacedOpeners(input, made).length <= opened &&
        offTheirTime(input, made) <= off &&
        dayShape(input, made).returns <= shape.returns &&
        dayMetres(input, made) <= walk - SAVING_M
      ) {
        itinerary = next;
        break;
      }
    }
  }
  return itinerary;
}
