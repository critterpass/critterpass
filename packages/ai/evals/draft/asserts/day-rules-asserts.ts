/**
 * How a day is laid out, as a traveller would judge it: the long outdoor sight that is best early
 * opens its day; a meal is near the stop before or after it; a breakfast is followed by the first
 * sight, not by a hole; and the afternoon the crew lands stays near where it sleeps. (That a
 * title claims only what the day holds, in order, is `titleFits` in ./day-shape-asserts.)
 */
import type { Itinerary } from '@cp/domain';
import {
  detourMin,
  isKept,
  mealAcrossTown,
  mealAt,
  minuteOfDate,
  opensDay,
  placeIdOf,
} from '@cp/planner';

import { homeOf, hopCap } from '../../../src/prompts/draft/areas';
import type { DraftPlanInput } from '../../../src/prompts/draft/context';

/** Minutes with nothing planned after a breakfast before the day's next stop. */
const AFTER_BREAKFAST_MAX_MIN = 45;

export function gradeDayRules(input: DraftPlanInput, itinerary: Itinerary): string[] {
  const failures: string[] = [];
  const { tz } = input.frame;
  const reach = { homeId: homeOf(input), hopCapMin: hopCap(input), travel: input.travel };
  const name = (id: string | null) => input.pois.get(id ?? '')?.name ?? 'a stop';
  for (const day of itinerary.days) {
    const at = (iso: string) => minuteOfDate(new Date(iso), day.date, tz);
    day.items.forEach((item, index) => {
      const poi = input.pois.get(placeIdOf(item) ?? '');
      const next = day.items[index + 1];
      const before = day.items[index - 1];
      // The long outdoor sight opens the day: no other sight of the guide's before it.
      if (poi !== undefined && item.kind !== 'meal' && !isKept(item) && opensDay(poi, reach)) {
        const earlier = day.items
          .slice(0, index)
          .filter((other) => other.kind !== 'meal' && !isKept(other))
          .filter((other) => {
            const there = input.pois.get(placeIdOf(other) ?? '');
            return there === undefined || !opensDay(there, reach);
          });
        if (earlier.length > 0) {
          failures.push(
            `day ${day.day_no}: ${poi.name} is best early and comes after ${name(earlier[0]?.poi_id ?? null)}`,
          );
        }
      }
      // A meal is near the stop before or after it (the last stop of a day is the way home).
      const between = before !== undefined && next !== undefined && index < day.items.length - 1;
      if (item.kind === 'meal' && !isKept(item) && between) {
        const [a, b, c] = [placeIdOf(before), placeIdOf(item), placeIdOf(next)];
        const dinnerHome = mealAt(at(item.starts_at)) === 'dinner' && next.kind !== 'meal';
        if (a !== null && b !== null && c !== null && !dinnerHome) {
          if (mealAcrossTown(a, b, c, input.travel)) {
            failures.push(
              `day ${day.day_no}: ${name(item.poi_id)} is ${detourMin(a, b, c, input.travel)} minutes out of the way between ${name(before.poi_id)} and ${name(next.poi_id)}, which are next to each other`,
            );
          }
        }
      }
      // A breakfast is followed by the first sight, not by a hole.
      if (
        item.kind === 'meal' &&
        mealAt(at(item.starts_at)) === 'breakfast' &&
        next !== undefined
      ) {
        const hole = at(next.starts_at) - at(item.ends_at) - next.travel_min;
        if (hole > AFTER_BREAKFAST_MAX_MIN) {
          failures.push(`day ${day.day_no}: ${hole} minutes with nothing after breakfast`);
        }
      }
    });
  }
  // The afternoon the crew lands stays near where it sleeps.
  const first = itinerary.days[0];
  if (first !== undefined && itinerary.days.length > 1) {
    for (const item of first.items) {
      const open = item.poi_id === null ? undefined : input.pools.openDays.get(item.poi_id);
      if (isKept(item) || open === undefined || open.includes(first.day_no)) continue;
      failures.push(`arrival day: ${name(item.poi_id)} is far from where the crew stays`);
    }
  }
  return failures;
}
