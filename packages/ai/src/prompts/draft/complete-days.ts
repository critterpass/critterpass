/**
 * What the planner finishes by itself, without another model call. A day that runs through lunch
 * or dinner and has no place for it gets the best one near its stops from its own meal list (thin
 * days and holes are filled in ./fill-days.ts). A stop added here carries our editors' line about the
 * place when there is one, else none. A stop is added only when the day stays as clean as it was.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import {
  choicesOfDay,
  dayWindow,
  isKept,
  longRideMin,
  mealSlots,
  mealsOf,
  minuteOfDate,
  RIDE_HOME_MAX_MIN,
  stopKind,
  withinReach,
  type DraftPoi,
} from '@cp/planner';

import { agreementOfStop } from './agreement';
import { areaStep, besideStops, hopCap, rideFrom } from './areas';
import { placeNames, type DraftPlanInput } from './context';
import { scheduleChoices } from './day';
import { proseProblem } from './schema';
import type { SkeletonDay } from './skeleton';
import { misplacedOpeners } from './openers';
import { validate } from './validate';

/**
 * Of `places`, those beside the day's stops, then those the day's one longer ride can reach, then
 * (for a dinner) those a ride home can; within each, those in the day's own areas first (a short
 * ride from its stops before the rest of the area, best first), then those in a second area, then
 * the rest, the nearest first.
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
    .map((poi, rank) => {
      const step = areaStep(input, poi.id, here);
      return {
        poi,
        rank,
        ring: ring(poi),
        step,
        far: step === 0 && !besideStops(input, poi.id, here) ? 1 : 0,
        ride: step === 0 ? 0 : rideFrom(input, poi.id, here),
      };
    })
    .filter((entry) => entry.ring !== -1)
    .sort(
      (a, b) =>
        a.ring - b.ring || a.step - b.step || a.far - b.far || a.ride - b.ride || a.rank - b.rank,
    )
    .map((entry) => entry.poi);
}

export function editorsLine(input: DraftPlanInput, poi: DraftPoi): string | null {
  // Our editors write in English: a reader of another language gets no line rather than theirs.
  if (input.locale !== undefined && !input.locale.toLowerCase().startsWith('en')) return null;
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
    // `finish` may have timed the day again: the stop added must still be on it.
    if (!made.items.some((item) => item.poi_id === poi.id)) continue;
    if (accept(before, dayFaults(input, candidate, outline.dayNo), made)) return candidate;
  }
  return null;
}

/**
 * Lunch is eaten among the day's stops until mid-afternoon, dinner where its afternoon goes: the
 * halves part three hours before the local dinner (three in the afternoon where dinner is at six,
 * half past five in Barcelona).
 */
const HALF_BEFORE_DINNER_MIN = 180;

/**
 * The stops a missing meal belongs beside: those of its half of the day (all of them when that
 * half has none), so a dinner is near where the afternoon ends, not back where the morning was.
 * A stop the crew is still at in the hour before dinner (a market before a late dinner) is where
 * dinner is.
 */
function mealNeighbours(input: DraftPlanInput, day: DraftDay, slot: 'lunch' | 'dinner'): string[] {
  const at = (iso: string) => minuteOfDate(new Date(iso), day.date, input.frame.tz);
  const ids = (items: DraftDay['items']) =>
    items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));
  const dinner = mealsOf(dayWindow(input.frame, day.day_no - 1)).dinner.startMin;
  const split = dinner - HALF_BEFORE_DINNER_MIN;
  const out = day.items.filter(
    (item) =>
      item.kind !== 'meal' && at(item.ends_at) >= dinner - 60 && at(item.starts_at) <= dinner,
  );
  if (slot === 'dinner' && out.length > 0) return ids(out);
  const half = day.items.filter((item) =>
    slot === 'lunch' ? at(item.starts_at) < split : at(item.ends_at) > split,
  );
  return half.length > 0 ? ids(half) : ids(day.items);
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
      const here = mealNeighbours(input, day, slot);
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
      // The meal lands and nothing else breaks for it, nor pushes a stop that opens the day off
      // its morning.
      const opened = misplacedOpeners(input, day).length;
      const lands = (before: Faults, after: Faults, made: DraftDay) =>
        after.hard <= before.hard &&
        after.meals < before.meals &&
        misplacedOpeners(input, made).length <= opened;
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
          // An essential place never gives way to a meal: the day says it has none instead.
          .filter(
            (item) =>
              !isKept(item) &&
              item.kind === 'activity' &&
              input.pois.get(item.poi_id ?? '')?.essential !== true,
          )
          .reverse()
          // A sight itinerary pages agree on gives way last.
          .sort((a, b) => agreementOfStop(input, b) - agreementOfStop(input, a));
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
