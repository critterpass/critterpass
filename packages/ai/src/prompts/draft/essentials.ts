/**
 * The essential handful of a destination (`DraftPoi.essential`, at most fifteen, flagged by our
 * editors): the places a first visit should hold. They lead the trip's core must-sees, so the
 * outline, the day stage and the fills all place them first; once the days are settled, one still
 * missing is put on a day that can take it, a stop nobody asked for giving way if it must; and one
 * the draft leaves out is reported with the reason, so nobody has to guess why it is not there.
 */
import type { Itinerary } from '@cp/domain';
import { foodRole, isKept, RIDE_HOME_MAX_MIN, type DraftPoi } from '@cp/planner';

import { homeOf } from './areas';
import { addOne, dayFaults, fillMeals, nearFirst } from './complete-days';
import type { DraftPlanInput } from './context';
import type { SkeletonDay } from './skeleton';

/** Why an essential place is not in a draft. */
export type EssentialGap =
  /** Not open on any day of the trip. */
  | 'closed'
  /** Too long a ride from where the crew stays for any day. */
  | 'too_far'
  /** Not offered for this draft: the organiser holds it herself or took it out. */
  | 'not_offered'
  /** A day it could go on holds stops the organiser placed, and it fits around them on none. */
  | 'held_in_the_way'
  /** Every day it could go on is full of stops the planner may not move. */
  | 'no_room';

export interface EssentialLeftOut {
  readonly poiId: string;
  readonly reason: EssentialGap;
}

/** The destination's essential sights, as the draft's places carry them. */
export function essentialsOf(input: Pick<DraftPlanInput, 'pois'>): DraftPoi[] {
  return [...input.pois.values()].filter(
    (poi) => poi.essential === true && foodRole(poi) !== 'meal',
  );
}

function held(itinerary: Itinerary): Set<string> {
  return new Set(itinerary.days.flatMap((day) => day.items.map((item) => item.poi_id ?? '')));
}

/** The essentials the draft does not hold, each with why. */
export function essentialsLeftOut(input: DraftPlanInput, itinerary: Itinerary): EssentialLeftOut[] {
  const there = held(itinerary);
  const home = homeOf(input);
  const offered = new Set([
    ...input.pools.sights.map((poi) => poi.id),
    ...input.pools.activities.map((poi) => poi.id),
    ...input.pools.mustDos.map((slot) => slot.poiId),
  ]);
  const hers = new Set((input.held ?? []).map((stop) => stop.dayNo));
  return essentialsOf(input)
    .filter((poi) => !there.has(poi.id))
    .map((poi): EssentialLeftOut => {
      const open = input.pools.openDays.get(poi.id) ?? [];
      const ride = home === null ? 0 : (input.travel(home, poi.id) ?? 0);
      const reason: EssentialGap =
        ride > RIDE_HOME_MAX_MIN
          ? 'too_far'
          : open.length === 0
            ? 'closed'
            : !offered.has(poi.id)
              ? 'not_offered'
              : open.some((dayNo) => hers.has(dayNo))
                ? 'held_in_the_way'
                : 'no_room';
      return { poiId: poi.id, reason };
    });
}

/**
 * Puts each essential the settled draft still lacks on a day it is open, the day whose stops it
 * sits nearest first: added when the day stays as clean, else in the seat of a stop that is
 * neither the crew's own nor an essential (the last such stop first).
 */
export function placeEssentials(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  start: Itinerary,
): { readonly itinerary: Itinerary; readonly added: number } {
  let itinerary = start;
  let added = 0;
  const essential = new Set(essentialsOf(input).map((poi) => poi.id));
  for (const { poiId, reason } of essentialsLeftOut(input, start)) {
    const poi = input.pois.get(poiId);
    if (poi === undefined || (reason !== 'no_room' && reason !== 'held_in_the_way')) continue;
    const open = input.pools.openDays.get(poiId) ?? [];
    const days = itinerary.days
      .filter((day) => open.includes(day.day_no))
      .map((day) => {
        const here = day.items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));
        return { day, near: nearFirst(input, [poi], here).length > 0 ? 0 : 1 };
      })
      .sort((a, b) => a.near - b.near || a.day.items.length - b.day.items.length);
    let placed: Itinerary | null = null;
    for (const { day } of days) {
      const outline = outlines.find((d) => d.dayNo === day.day_no);
      if (outline === undefined) continue;
      const fed = (candidate: Itinerary) => fillMeals(input, [outline], candidate).itinerary;
      const clean = (
        before: { hard: number; meals: number },
        after: { hard: number; meals: number },
      ) => after.hard <= before.hard && after.meals <= before.meals;
      const key = `essential-${day.day_no}-${poiId}`;
      // Last in the day's order, or first (a place a ride out of town opens the day).
      const tryOn = (plan: Itinerary, tag: string, baseline?: { hard: number; meals: number }) =>
        addOne(input, outline, plan, [poi], clean, `${key}-${tag}`, fed, baseline) ??
        addOne(input, outline, plan, [poi], clean, `${key}-${tag}-first`, fed, baseline, 0);
      placed = tryOn(itinerary, 'add');
      if (placed !== null) break;
      const baseline = dayFaults(input, itinerary, day.day_no);
      const giveWay = day.items
        .filter(
          (item) => !isKept(item) && item.kind === 'activity' && !essential.has(item.poi_id ?? ''),
        )
        .reverse();
      for (const item of giveWay) {
        const lighter = {
          ...itinerary,
          days: itinerary.days.map((d) =>
            d.day_no === day.day_no
              ? { ...d, items: d.items.filter((i) => i.stable_id !== item.stable_id) }
              : d,
          ),
        };
        placed = tryOn(lighter, `for-${item.stable_id}`, baseline);
        if (placed !== null) break;
      }
      if (placed !== null) break;
    }
    if (placed === null) continue;
    itinerary = placed;
    added += 1;
  }
  return { itinerary, added };
}
