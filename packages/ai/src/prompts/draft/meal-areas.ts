/**
 * Meals where the day is. Once a day's stops are set, its lunch and dinner come from the areas of
 * the stops around them: itinerary pages eat where the day is, and a lunch across town between two
 * museums of one district is a ride out and a ride back. A meal in neither the area of the stop
 * before it nor of the one after gives way to a place in one of those areas, when there is one and
 * the day stays as clean, as full and as straight as it was, with no stop moved off its best time.
 * A crew with tastes also has a meal in the right area that suits none of them swapped for one
 * that does (a hawker centre for a street food crew, a brewpub for a nightlife crew). A meal the
 * crew asked for or placed stays; a famous meal gives way only to another famous one.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import {
  choicesOfDay,
  dayWindow,
  isKept,
  mealSlots,
  mealsOf,
  minuteOfDate,
  missesBestTime,
  sameDish,
  stopKind,
  tasteScore,
  type DraftPoi,
} from '@cp/planner';

import { ownArea, rideFrom } from './areas';
import { dayFaults, editorsLine } from './complete-days';
import type { DraftPlanInput } from './context';
import { scheduleChoices } from './day';
import { misplacedOpeners } from './openers';
import type { SkeletonDay } from './skeleton';

/** Places tried for one meal. */
const TRIED = 6;

/** How the day moves about: returns to an area it has left, then areas it sees. */
export function dayShape(
  input: DraftPlanInput,
  day: DraftDay,
): { readonly returns: number; readonly areas: number } {
  const area = (id: string) => ownArea(input, id);
  const seen = new Set<string>();
  let current: string | undefined;
  let returns = 0;
  for (const item of day.items) {
    const here = item.poi_id === null ? undefined : area(item.poi_id);
    if (here === undefined || here === current) continue;
    if (seen.has(here)) returns += 1;
    seen.add(here);
    current = here;
  }
  return { returns, areas: seen.size };
}

/** Stops of the day that start outside every time of day they are best at. */
function offTheirTime(input: DraftPlanInput, day: DraftDay): number {
  return day.items.filter((item) => {
    const poi = item.kind === 'activity' ? input.pois.get(item.poi_id ?? '') : undefined;
    const start = minuteOfDate(new Date(item.starts_at), day.date, input.frame.tz);
    return poi !== undefined && missesBestTime(poi, start);
  }).length;
}

const famous = (poi: DraftPoi) => poi.essential === true || poi.mustSee;

/** The ids of the nearest stops that are not meals before and after `at`. */
function aroundMeal(day: DraftDay, at: number): string[] {
  const before = day.items
    .slice(0, at)
    .reverse()
    .find((item) => item.kind !== 'meal' && item.poi_id !== null);
  const after = day.items
    .slice(at + 1)
    .find((item) => item.kind !== 'meal' && item.poi_id !== null);
  return [before?.poi_id, after?.poi_id].filter((id): id is string => id != null);
}

/**
 * Places that could take the meal at `at` instead, best first: in an area of the stops around it
 * (the area both share first), famous before the rest, then the crew's tastes, then the nearest.
 */
function insteadOf(
  input: DraftPlanInput,
  itinerary: Itinerary,
  day: DraftDay,
  at: number,
  wanted: ReadonlySet<string>,
): DraftPoi[] {
  const item = day.items[at];
  const current = input.pois.get(item?.poi_id ?? '');
  if (item === undefined || current === undefined) return [];
  const window = dayWindow(input.frame, day.day_no - 1);
  const start = minuteOfDate(new Date(item.starts_at), day.date, input.frame.tz);
  const slot = start >= mealsOf(window).dinner.startMin - 90 ? 'dinner' : 'lunch';
  const used = new Set(itinerary.days.flatMap((d) => d.items.map((i) => i.poi_id)));
  const area = (id: string) => ownArea(input, id);
  const around = aroundMeal(day, at);
  const nearDays = itinerary.days.filter((d) => Math.abs(d.day_no - day.day_no) <= 1);
  const otherMeals = nearDays.flatMap((d) =>
    d.items.flatMap((i) => {
      const poi = i === item || i.kind !== 'meal' ? undefined : input.pois.get(i.poi_id ?? '');
      return poi === undefined ? [] : [poi];
    }),
  );
  const shared = new Set(around.map(area));
  return input.pools.eateries
    .filter(
      (poi) =>
        !used.has(poi.id) &&
        wanted.has(area(poi.id) ?? '') &&
        (!famous(current) || famous(poi)) &&
        (input.pools.openDays.get(poi.id) ?? []).includes(day.day_no) &&
        mealSlots(poi, day.date).includes(slot) &&
        !otherMeals.some((other) => sameDish(other, poi)),
    )
    .map((poi, rank) => ({
      poi,
      rank,
      both: around.every((id) => area(id) === area(poi.id)) && shared.size > 0 ? 0 : 1,
      worth: famous(poi) ? 0 : 1,
      taste: tasteScore(poi, input.tastes),
      ride: rideFrom(input, poi.id, around),
    }))
    .sort(
      (a, b) =>
        a.both - b.both ||
        a.worth - b.worth ||
        b.taste - a.taste ||
        a.ride - b.ride ||
        a.rank - b.rank,
    )
    .slice(0, TRIED)
    .map((entry) => entry.poi);
}

/** `day` with the meal at `at` at `poi` instead, timed again by the planner. */
function withMealAt(
  input: DraftPlanInput,
  outline: SkeletonDay,
  itinerary: Itinerary,
  day: DraftDay,
  at: number,
  poi: DraftPoi,
): Itinerary {
  const choices = choicesOfDay(day);
  const old = choices[at];
  if (old === undefined) return itinerary;
  choices[at] = {
    ...old,
    poiId: poi.id,
    kind: stopKind(poi),
    note: editorsLine(input, poi),
  };
  const next = scheduleChoices(
    input,
    {
      ...outline,
      mustDoIds: choices.flatMap((c) => (c.mustDoId === null ? [] : [c.mustDoId])),
      poiIds: choices.filter((c) => c.kind === 'activity').map((c) => c.poiId),
    },
    choices,
    `meal-area-${outline.dayNo}-${poi.id}`,
  );
  return {
    ...itinerary,
    days: itinerary.days.map((d) => (d.day_no === day.day_no ? { ...next, theme: day.theme } : d)),
  };
}

/** See the file note: the day's meals in the areas of the stops around them. */
export function withMealsInDayAreas(
  input: DraftPlanInput,
  outline: SkeletonDay,
  start: Itinerary,
): Itinerary {
  let itinerary = start;
  const area = (id: string) => ownArea(input, id);
  const tasteful = Object.values(input.tastes).some((count) => count > 0);
  const dayOf = (plan: Itinerary) => plan.days.find((d) => d.day_no === outline.dayNo);
  for (const meal of (dayOf(start)?.items ?? []).filter((item) => item.kind === 'meal')) {
    const day = dayOf(itinerary);
    const at = day?.items.findIndex((item) => item.stable_id === meal.stable_id) ?? -1;
    if (day === undefined || at === -1 || isKept(meal) || meal.poi_id === null) continue;
    const poi = input.pois.get(meal.poi_id);
    if (poi === undefined) continue;
    const wanted = new Set(aroundMeal(day, at).flatMap((id) => area(id) ?? []));
    const mine = area(poi.id);
    const inPlace = mine !== undefined && wanted.has(mine);
    if (wanted.size === 0 || (inPlace && (!tasteful || tasteScore(poi, input.tastes) > 0))) {
      continue;
    }
    const before = dayFaults(input, itinerary, outline.dayNo);
    const shape = dayShape(input, day);
    const opened = misplacedOpeners(input, day).length;
    const off = offTheirTime(input, day);
    for (const candidate of insteadOf(input, itinerary, day, at, wanted)) {
      // In the right area already, a meal gives way only to one that suits the crew.
      if (inPlace && tasteScore(candidate, input.tastes) === 0) continue;
      const next = withMealAt(input, outline, itinerary, day, at, candidate);
      const made = dayOf(next);
      if (made === undefined || made.items.length !== day.items.length) continue;
      if (!made.items.some((item) => item.poi_id === candidate.id && item.kind === 'meal')) {
        continue;
      }
      const after = dayFaults(input, next, outline.dayNo);
      const now = dayShape(input, made);
      const straighter =
        now.returns < shape.returns || (now.returns === shape.returns && now.areas <= shape.areas);
      if (
        after.hard <= before.hard &&
        after.meals <= before.meals &&
        misplacedOpeners(input, made).length <= opened &&
        offTheirTime(input, made) <= off &&
        straighter
      ) {
        itinerary = next;
        break;
      }
    }
  }
  return itinerary;
}
