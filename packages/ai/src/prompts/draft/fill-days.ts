/**
 * Once the repairs are done, a day left with too few stops, or with hours of nothing between two
 * stops or before dinner time, gets the planned, spare or nearby activities it can still take (and
 * the meal a new stop brings within reach). A full day that opens with lunch gets a stop before
 * it. The planner takes first the kind of place the day lacks (./variety.ts). A stop goes where
 * the hole is, carries our editors'
 * line about the place when there is one, and is added only when the day stays as clean as it was.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import {
  DINNER,
  dayWindow,
  foodRole,
  isKept,
  mealsInWindow,
  minuteOfDate,
  type DayWindow,
  type DraftPoi,
} from '@cp/planner';

import { stopBudget } from './budget';
import { hopCap } from './areas';
import { addOne, dayFaults, fillMeals, nearFirst, type Attempt } from './complete-days';
import type { DraftPlanInput } from './context';
import { coreMustSees } from './must-sees';
import type { SkeletonDay } from './skeleton';
import { byVariety } from './variety';

/** Stops a full day should have at least, meals included, when there are places for them. */
const MIN_DAY_STOPS = 4;
/** Minutes with nothing planned between two stops (travel aside) that make a hole in a day. */
const HOLE_MIN = 120;
const NEARBY_TRIED = 10;
/** A full day whose first stop is a meal this long after the day opens has no morning. */
const LATE_OPEN_MIN = 60;
/** A day of short stops may take this many to close its holes. */
const MAX_FILLED_STOPS = 9;

interface Hole {
  readonly minutes: number;
  /** The index in the day's order a stop that fills it would take. */
  readonly at: number;
}

/**
 * The longest stretch of a day with nothing planned: before its first stop, between two, or from
 * its last stop to dinner time (or the end of a day that stops before then).
 */
function longestHole(input: DraftPlanInput, day: DraftDay, window: DayWindow): Hole {
  let at = window.startMin;
  let longest: Hole = { minutes: 0, at: 0 };
  day.items.forEach((item, index) => {
    const start = minuteOfDate(new Date(item.starts_at), day.date, input.frame.tz);
    const free = start - at - item.travel_min;
    if (free > longest.minutes) longest = { minutes: free, at: index };
    at = minuteOfDate(new Date(item.ends_at), day.date, input.frame.tz);
  });
  const tail = Math.min(window.endMin, DINNER.startMin) - at;
  return tail > longest.minutes ? { minutes: tail, at: day.items.length } : longest;
}

/**
 * Gives a day left with too few stops, or with a hole in it, the planned, spare or nearby
 * activities it can still take: each must leave the day as clean as it was, and when the day
 * already has its stops, make its longest hole shorter.
 */
const rides = (day: DraftDay | undefined) =>
  (day?.items ?? []).reduce((sum, item) => sum + item.travel_min, 0);

/**
 * A meal the day rides far for is swapped for one beside its stops, when that leaves the day as
 * clean and with less riding: a lunch across the island uses up the road the afternoon needs.
 */
function withNearerMeals(input: DraftPlanInput, outline: SkeletonDay, start: Itinerary): Itinerary {
  let itinerary = start;
  const far = Math.round(hopCap(input) / 2);
  const dayOf = (plan: Itinerary) => plan.days.find((d) => d.day_no === outline.dayNo);
  for (const meal of (dayOf(start)?.items ?? []).filter((item) => item.kind === 'meal')) {
    const day = dayOf(itinerary);
    const at = day?.items.findIndex((item) => item.stable_id === meal.stable_id) ?? -1;
    if (day === undefined || at === -1 || isKept(meal)) continue;
    const around = Math.max(meal.travel_min, day.items[at + 1]?.travel_min ?? 0);
    if (around <= far) continue;
    const without = {
      ...itinerary,
      days: itinerary.days.map((d) =>
        d === day ? { ...d, items: d.items.filter((item) => item !== day.items[at]) } : d,
      ),
    };
    const refilled = fillMeals(input, [outline], without).itinerary;
    const before = dayFaults(input, itinerary, outline.dayNo);
    const after = dayFaults(input, refilled, outline.dayNo);
    const better =
      after.hard <= before.hard &&
      after.meals <= before.meals &&
      rides(dayOf(refilled)) < rides(day) &&
      (dayOf(refilled)?.items.length ?? 0) === day.items.length;
    if (better) itinerary = refilled;
  }
  return itinerary;
}

export function fillThinDays(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  start: Itinerary,
): Attempt {
  let itinerary = start;
  let added = 0;
  for (const outline of outlines) {
    itinerary = withNearerMeals(input, outline, itinerary);
    const window = dayWindow(input.frame, outline.dayNo - 1);
    const room = stopBudget(window.endMin - window.startMin);
    const target = Math.min(MIN_DAY_STOPS, room, 1 + mealsInWindow(window).length * 2);
    for (let round = 0; round < MAX_FILLED_STOPS; round += 1) {
      const day = itinerary.days.find((d) => d.day_no === outline.dayNo);
      if (day === undefined) break;
      const found = longestHole(input, day, window);
      // A full day that opens with lunch has lost its morning, however short the wait for it.
      const first = day.items[0];
      const full = outline.dayNo > 1 && outline.dayNo < input.frame.dates.length;
      const lateOpen =
        full &&
        first?.kind === 'meal' &&
        first.must_do_id === null &&
        minuteOfDate(new Date(first.starts_at), day.date, input.frame.tz) - window.startMin >=
          LATE_OPEN_MIN;
      const hole = lateOpen ? { minutes: Math.max(found.minutes, HOLE_MIN), at: 0 } : found;
      const thin = day.items.length < target;
      if (!thin && hole.minutes < HOLE_MIN) break;
      // The stop budget counts stops, not hours: a day of short stops with an empty afternoon
      // takes more.
      if (day.items.length >= (hole.minutes >= HOLE_MIN ? MAX_FILLED_STOPS : room)) break;
      const here = day.items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));
      const openToday = (poi: DraftPoi) =>
        (input.pools.openDays.get(poi.id) ?? []).includes(outline.dayNo);
      // The pool first; then any sight we know near the day, so a hole beside a part of the map
      // the pool passed over is still filled.
      const nearby = [
        ...nearFirst(
          input,
          coreMustSees(input)
            .map((id) => input.pois.get(id))
            .filter((poi): poi is DraftPoi => poi !== undefined && openToday(poi)),
          here,
        ),
        ...nearFirst(input, input.pools.activities.filter(openToday), here).slice(0, NEARBY_TRIED),
        ...nearFirst(input, input.pools.sights.filter(openToday), here).slice(0, NEARBY_TRIED),
      ].map((poi) => poi.id);
      const used = new Set(itinerary.days.flatMap((d) => d.items.map((item) => item.poi_id)));
      const hasBreak = day.items.some((item) => {
        const poi = input.pois.get(item.poi_id ?? '');
        return poi !== undefined && foodRole(poi) === 'light';
      });
      const offered = [...new Set([...outline.poiIds, ...outline.spareIds, ...nearby])]
        .map((id) => input.pois.get(id))
        .filter(
          (poi): poi is DraftPoi =>
            poi !== undefined && !used.has(poi.id) && !(hasBreak && foodRole(poi) === 'light'),
        );
      // The trip's core must-sees first, in their order: a hole is theirs before anyone's.
      const core = coreMustSees(input);
      const rank = (poi: DraftPoi) => {
        const at = core.indexOf(poi.id);
        return at === -1 ? core.length : at;
      };
      const candidates = byVariety(
        input,
        [...offered].sort((a, b) => rank(a) - rank(b)),
        here,
        [...used].filter((id): id is string => id !== null),
      );
      const next = addOne(
        input,
        outline,
        itinerary,
        candidates,
        (before, after, filled) =>
          after.hard <= before.hard &&
          after.meals <= before.meals &&
          (thin ||
            (lateOpen
              ? filled.items[0]?.kind !== 'meal'
              : longestHole(input, filled, window).minutes < hole.minutes)),
        `fill-${outline.dayNo}-${round}`,
        // A new stop can bring a meal place within reach: the day gets that meal with it.
        (candidate) => fillMeals(input, [outline], candidate).itinerary,
        undefined,
        hole.minutes >= HOLE_MIN ? hole.at : undefined,
      );
      if (next === null) break;
      itinerary = next;
      added += 1;
    }
  }
  return { itinerary, added };
}
