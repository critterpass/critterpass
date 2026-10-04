/**
 * What the planner finishes by itself, without another model call. A day that runs through lunch
 * or dinner and has no place for it gets the best one near its stops from its own meal list; and
 * once the repairs are done, a day left with too few stops, or with hours of nothing between two
 * stops, gets the planned, spare or nearby activities it can still take. A stop added here carries our editors' line about the place when
 * there is one, else none. A stop is added only when the day stays as clean as it was.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import {
  dayWindow,
  foodRole,
  mealSlots,
  mealsInWindow,
  minuteOfDate,
  stopKind,
  withinReach,
  type DayChoice,
  type DraftPoi,
} from '@cp/planner';

import { hopCap } from './areas';
import { stopBudget } from './budget';
import { placeNames, type DraftPlanInput } from './context';
import { scheduleChoices } from './day';
import { proseProblem } from './schema';
import type { SkeletonDay } from './skeleton';
import { validate } from './validate';

/** Stops a full day should have at least, meals included, when there are places for them. */
const MIN_DAY_STOPS = 4;
/** Minutes with nothing planned between two stops (travel aside) that make a hole in a day. */
const HOLE_MIN = 150;
const NEARBY_TRIED = 10;

/** The longest stretch of a day with nothing planned: before its first stop, or between two. */
function longestHole(input: DraftPlanInput, day: DraftDay, startMin: number): number {
  let at = startMin;
  let longest = 0;
  for (const item of day.items) {
    const start = minuteOfDate(new Date(item.starts_at), day.date, input.frame.tz);
    longest = Math.max(longest, start - at - item.travel_min);
    at = minuteOfDate(new Date(item.ends_at), day.date, input.frame.tz);
  }
  return longest;
}

function choicesOf(day: DraftDay): DayChoice[] {
  return day.items.map((item) => ({
    poiId: item.poi_id ?? '',
    kind: item.kind,
    mustDoId: item.must_do_id,
    note: item.note,
  }));
}

function editorsLine(input: DraftPlanInput, poi: DraftPoi): string | null {
  const line = poi.whyGo ?? null;
  return line !== null && proseProblem(line, 200, placeNames(input)) === null ? line : null;
}

function dayFaults(input: DraftPlanInput, itinerary: Itinerary, dayNo: number): number {
  return validate(input, itinerary).violations.filter((v) => v.dayNo === dayNo).length;
}

interface Attempt {
  readonly itinerary: Itinerary;
  readonly added: number;
}

/** Tries `candidates` one at a time on day `dayNo`; keeps the first that leaves fewer faults. */
function addOne(
  input: DraftPlanInput,
  outline: SkeletonDay,
  itinerary: Itinerary,
  candidates: readonly DraftPoi[],
  accept: (before: number, after: number, next: DraftDay) => boolean,
  key: string,
): Itinerary | null {
  const day = itinerary.days.find((d) => d.day_no === outline.dayNo);
  if (day === undefined) return null;
  const before = dayFaults(input, itinerary, outline.dayNo);
  for (const poi of candidates) {
    const choices = [
      ...choicesOf(day),
      { poiId: poi.id, kind: stopKind(poi), mustDoId: null, note: editorsLine(input, poi) },
    ];
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
    const candidate = {
      ...itinerary,
      days: itinerary.days.map((d) =>
        d.day_no === outline.dayNo ? { ...next, theme: day.theme } : d,
      ),
    };
    if (accept(before, dayFaults(input, candidate, outline.dayNo), next)) return candidate;
  }
  return null;
}

/** Gives every day the lunch and dinner it is missing, from the meal places near it. */
export function fillMeals(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  start: Itinerary,
): Attempt {
  let itinerary = start;
  let added = 0;
  for (const outline of outlines) {
    for (let round = 0; round < 2; round += 1) {
      const missing = validate(input, itinerary).violations.find(
        (v) => v.code === 'MEAL_MISSING' && v.dayNo === outline.dayNo,
      );
      const day = itinerary.days.find((d) => d.day_no === outline.dayNo);
      if (missing?.slot === undefined || day === undefined) break;
      const slot = missing.slot;
      const used = new Set(itinerary.days.flatMap((d) => d.items.map((item) => item.poi_id)));
      const here = day.items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));
      const listed = outline.mealIds
        .map((id) => input.pois.get(id))
        .filter((poi): poi is DraftPoi => poi !== undefined);
      const nearby = input.pools.eateries.filter((poi) =>
        withinReach(poi.id, here, input.travel, hopCap(input)),
      );
      const candidates = [...new Set([...listed, ...nearby])].filter(
        (poi) => !used.has(poi.id) && mealSlots(poi, outline.date).includes(slot),
      );
      const next = addOne(
        input,
        outline,
        itinerary,
        candidates.slice(0, 12),
        (before, after) => after < before,
        `meal-${outline.dayNo}-${round}`,
      );
      if (next === null) break;
      itinerary = next;
      added += 1;
    }
  }
  return { itinerary, added };
}

/**
 * Gives a day left with too few stops, or with a hole in it, the planned, spare or nearby
 * activities it can still take: each must leave the day as clean as it was, and when the day
 * already has its stops, make its longest hole shorter.
 */
export function fillThinDays(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  start: Itinerary,
): Attempt {
  let itinerary = start;
  let added = 0;
  for (const outline of outlines) {
    const window = dayWindow(input.frame, outline.dayNo - 1);
    const room = stopBudget(window.endMin - window.startMin);
    const target = Math.min(MIN_DAY_STOPS, room, 1 + mealsInWindow(window).length * 2);
    for (let round = 0; round < MIN_DAY_STOPS; round += 1) {
      const day = itinerary.days.find((d) => d.day_no === outline.dayNo);
      if (day === undefined || day.items.length >= room) break;
      const hole = longestHole(input, day, window.startMin);
      const thin = day.items.length < target;
      if (!thin && hole < HOLE_MIN) break;
      const here = day.items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));
      const nearby = input.pools.activities
        .filter(
          (poi) =>
            (input.pools.openDays.get(poi.id) ?? []).includes(outline.dayNo) &&
            withinReach(poi.id, here, input.travel, hopCap(input)),
        )
        .slice(0, NEARBY_TRIED)
        .map((poi) => poi.id);
      const used = new Set(itinerary.days.flatMap((d) => d.items.map((item) => item.poi_id)));
      const hasBreak = day.items.some((item) => {
        const poi = input.pois.get(item.poi_id ?? '');
        return poi !== undefined && foodRole(poi) === 'light';
      });
      const candidates = [...new Set([...outline.poiIds, ...outline.spareIds, ...nearby])]
        .map((id) => input.pois.get(id))
        .filter(
          (poi): poi is DraftPoi =>
            poi !== undefined && !used.has(poi.id) && !(hasBreak && foodRole(poi) === 'light'),
        );
      const next = addOne(
        input,
        outline,
        itinerary,
        candidates,
        (before, after, filled) =>
          after <= before && (thin || longestHole(input, filled, window.startMin) < hole),
        `fill-${outline.dayNo}-${round}`,
      );
      if (next === null) break;
      itinerary = next;
      added += 1;
    }
  }
  return { itinerary, added };
}
