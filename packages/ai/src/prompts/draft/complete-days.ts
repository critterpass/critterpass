/**
 * What the planner finishes by itself, without another model call. A day that runs through lunch
 * or dinner and has no place for it gets the best one near its stops from its own meal list (thin
 * days and holes are filled in ./fill-days.ts). A stop added here carries our editors' line about the
 * place when there is one, else none. A stop is added only when the day stays as clean as it was.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import {
  choicesOfDay,
  isKept,
  longRideMin,
  mealSlots,
  RIDE_HOME_MAX_MIN,
  stopKind,
  withinReach,
  type DraftPoi,
} from '@cp/planner';

import { hopCap } from './areas';
import { placeNames, type DraftPlanInput } from './context';
import { scheduleChoices } from './day';
import { proseProblem } from './schema';
import type { SkeletonDay } from './skeleton';
import { validate } from './validate';

/**
 * Of `places`, those beside the day's stops, then those the day's one longer ride can reach, then
 * (for a dinner) those a ride home can.
 */
export function nearFirst(
  input: DraftPlanInput,
  places: readonly DraftPoi[],
  here: readonly string[],
  dinner = false,
): DraftPoi[] {
  const cap = hopCap(input);
  const reaches = [cap, longRideMin(cap), ...(dinner ? [RIDE_HOME_MAX_MIN] : [])];
  const ring = (poi: DraftPoi) =>
    reaches.findIndex((reach) => withinReach(poi.id, here, input.travel, reach));
  return places
    .map((poi, rank) => ({ poi, rank, ring: ring(poi) }))
    .filter((entry) => entry.ring !== -1)
    .sort((a, b) => a.ring - b.ring || a.rank - b.rank)
    .map((entry) => entry.poi);
}

function editorsLine(input: DraftPlanInput, poi: DraftPoi): string | null {
  const line = poi.whyGo ?? null;
  return line !== null && proseProblem(line, 200, placeNames(input)) === null ? line : null;
}

/** What a day breaks: `hard` rules, and `meals` it runs through without one. */
export interface Faults {
  readonly hard: number;
  readonly meals: number;
}

export function dayFaults(input: DraftPlanInput, itinerary: Itinerary, dayNo: number): Faults {
  // Rules of the whole trip (the budget) count with the day's: a stop added must not break them.
  const own = validate(input, itinerary).violations.filter(
    (v) => v.dayNo === dayNo || v.dayNo === null,
  );
  const meals = own.filter((v) => v.code === 'MEAL_MISSING').length;
  return { hard: own.length - meals, meals };
}

export interface Attempt {
  readonly itinerary: Itinerary;
  readonly added: number;
}

/**
 * Tries `candidates` one at a time on day `dayNo`; keeps the first that `accept` takes, after
 * `finish` has had its go at the day with the new stop in it.
 */
export function addOne(
  input: DraftPlanInput,
  outline: SkeletonDay,
  itinerary: Itinerary,
  candidates: readonly DraftPoi[],
  accept: (before: Faults, after: Faults, next: DraftDay) => boolean,
  key: string,
  finish: (candidate: Itinerary) => Itinerary = (candidate) => candidate,
  /** What the day broke before anything was taken off it (default: what `itinerary` breaks). */
  baseline?: Faults,
  /** Where in the day's order the new stop goes (default: last; the planner may still reorder). */
  position?: number,
  /** The meal the new stop is for (a dinner waits for dinner time on a day with no lunch). */
  slot?: 'lunch' | 'dinner',
): Itinerary | null {
  const day = itinerary.days.find((d) => d.day_no === outline.dayNo);
  if (day === undefined) return null;
  const before = baseline ?? dayFaults(input, itinerary, outline.dayNo);
  for (const poi of candidates) {
    const choices = choicesOfDay(day);
    choices.splice(position ?? choices.length, 0, {
      poiId: poi.id,
      kind: stopKind(poi),
      mustDoId: null,
      note: editorsLine(input, poi),
      ...(slot === 'dinner' ? { mealSlot: 'dinner' as const } : {}),
    });
    const activities = choices.filter((c) => c.kind === 'activity' && c.mustDoId === null);
    const next = scheduleChoices(
      input,
      {
        ...outline,
        mustDoIds: choices.flatMap((c) => (c.mustDoId === null ? [] : [c.mustDoId])),
        poiIds: activities.map((c) => c.poiId),
      },
      choices,
      `${key}-${poi.id}`,
    );
    if (next.items.length !== choices.length) continue;
    const candidate = finish({
      ...itinerary,
      days: itinerary.days.map((d) =>
        d.day_no === outline.dayNo ? { ...next, theme: day.theme } : d,
      ),
    });
    const made = candidate.days.find((d) => d.day_no === outline.dayNo) ?? next;
    if (accept(before, dayFaults(input, candidate, outline.dayNo), made)) return candidate;
  }
  return null;
}

/**
 * Gives every day the lunch and dinner it is missing, from the meal places near it. On a day too
 * full to take the meal, an activity nobody asked for gives way to it (the last one first): a
 * crew that skips lunch for one more museum has a worse day.
 */
export function fillMeals(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  start: Itinerary,
): Attempt {
  let itinerary = start;
  let added = 0;
  for (const outline of outlines) {
    const tried = new Set<string>();
    for (;;) {
      const missing = validate(input, itinerary).violations.find(
        (v) =>
          v.code === 'MEAL_MISSING' &&
          v.dayNo === outline.dayNo &&
          v.slot !== undefined &&
          !tried.has(v.slot),
      );
      const day = itinerary.days.find((d) => d.day_no === outline.dayNo);
      if (missing?.slot === undefined || day === undefined) break;
      const slot = missing.slot;
      tried.add(slot);
      const used = new Set(itinerary.days.flatMap((d) => d.items.map((item) => item.poi_id)));
      const here = day.items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));
      const listed = outline.mealIds
        .map((id) => input.pois.get(id))
        .filter((poi): poi is DraftPoi => poi !== undefined);
      const nearby = nearFirst(input, input.pools.eateries, here, slot === 'dinner');
      // The nearest first, wherever they were listed: the day may have moved since the outline.
      const ringed = nearFirst(
        input,
        [...new Set([...listed, ...nearby])],
        here,
        slot === 'dinner',
      );
      const candidates = [...new Set([...ringed, ...listed])].filter(
        (poi) => !used.has(poi.id) && mealSlots(poi, outline.date).includes(slot),
      );
      // The meal lands and nothing else breaks for it.
      const lands = (before: Faults, after: Faults) =>
        after.hard <= before.hard && after.meals < before.meals;
      const key = `meal-${outline.dayNo}-${slot}`;
      let next = addOne(
        input,
        outline,
        itinerary,
        candidates.slice(0, 12),
        lands,
        key,
        undefined,
        undefined,
        undefined,
        slot,
      );
      if (next === null) {
        const baseline = dayFaults(input, itinerary, outline.dayNo);
        const giveWay = day.items
          .filter((item) => !isKept(item) && item.kind === 'activity')
          .reverse();
        for (const item of giveWay) {
          const lighter = {
            ...itinerary,
            days: itinerary.days.map((d) =>
              d.day_no === outline.dayNo
                ? { ...d, items: d.items.filter((i) => i.stable_id !== item.stable_id) }
                : d,
            ),
          };
          next = addOne(
            input,
            outline,
            lighter,
            candidates.slice(0, 6),
            lands,
            `${key}-for-${item.stable_id}`,
            undefined,
            baseline,
            undefined,
            slot,
          );
          if (next !== null) break;
        }
      }
      if (next === null) continue;
      itinerary = next;
      added += 1;
    }
  }
  return { itinerary, added };
}
