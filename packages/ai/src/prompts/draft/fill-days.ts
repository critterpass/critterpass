/**
 * Once the repairs are done, a day left with too few stops, or with hours of nothing between two
 * stops or before dinner time, gets the planned, spare or nearby activities it can still take (and
 * the meal a new stop brings within reach). A stop goes where the hole is, carries our editors'
 * line about the place when there is one, and is added only when the day stays as clean as it was.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import {
  DINNER,
  dayWindow,
  foodRole,
  mealsInWindow,
  minuteOfDate,
  type DayWindow,
  type DraftPoi,
} from '@cp/planner';

import { stopBudget } from './budget';
import { addOne, fillMeals, nearFirst, type Attempt } from './complete-days';
import type { DraftPlanInput } from './context';
import type { SkeletonDay } from './skeleton';

/** Stops a full day should have at least, meals included, when there are places for them. */
const MIN_DAY_STOPS = 4;
/** Minutes with nothing planned between two stops (travel aside) that make a hole in a day. */
const HOLE_MIN = 120;
const NEARBY_TRIED = 10;
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
    for (let round = 0; round < MAX_FILLED_STOPS; round += 1) {
      const day = itinerary.days.find((d) => d.day_no === outline.dayNo);
      if (day === undefined) break;
      const hole = longestHole(input, day, window);
      const thin = day.items.length < target;
      if (!thin && hole.minutes < HOLE_MIN) break;
      // The stop budget counts stops, not hours: a day of short stops with an empty afternoon
      // takes more.
      if (day.items.length >= (hole.minutes >= HOLE_MIN ? MAX_FILLED_STOPS : room)) break;
      const here = day.items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));
      const nearby = nearFirst(
        input,
        input.pools.activities.filter((poi) =>
          (input.pools.openDays.get(poi.id) ?? []).includes(outline.dayNo),
        ),
        here,
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
          after.hard <= before.hard &&
          after.meals <= before.meals &&
          (thin || longestHole(input, filled, window).minutes < hole.minutes),
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
