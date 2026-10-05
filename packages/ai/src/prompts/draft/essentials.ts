/**
 * The essential handful of a destination (`DraftPoi.essential`, at most fifteen, flagged by our
 * editors): the places a first visit should hold. They lead the trip's core must-sees, so the
 * outline, the day stage and the fills all place them first; once the days are settled, one still
 * missing is put on a day that can take it, a stop nobody asked for giving way if it must; and one
 * the draft leaves out is reported with the reason, so nobody has to guess why it is not there.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import { foodRole, isKept, opensDay, RIDE_HOME_MAX_MIN, type DraftPoi } from '@cp/planner';

import { homeOf, hopCap } from './areas';
import { addOne, dayFaults, fillMeals, nearFirst } from './complete-days';
import type { DraftPlanInput } from './context';
import { misplacedOpeners } from './openers';
import type { SkeletonDay } from './skeleton';

/** Why an essential place is not in a draft. */
export type EssentialGap =
  /** Not open on any day of the trip. */
  | 'closed'
  /** Too long a ride from where the crew stays for any day. */
  | 'too_far'
  /** Not offered for this draft: the organiser holds it herself or took it out. */
  | 'not_offered'
  /** Every day it could go on holds stops the organiser placed, and it fits around them on none. */
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
              : open.every((dayNo) => hers.has(dayNo))
                ? 'held_in_the_way'
                : 'no_room';
      return { poiId: poi.id, reason };
    });
}

/** Rounds of placing: an essential that made way for a longer one gets a turn of its own. */
const ROUNDS = 3;

/**
 * Puts each essential the settled draft still lacks on a day it is open, the day whose stops it
 * sits nearest first: added when the day stays as clean; else in the seat of a stop that is
 * neither the crew's own nor an essential (the last such stop first); else in the seat of a
 * shorter essential, which is then placed again on another day in the next round.
 */
export function placeEssentials(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  start: Itinerary,
): { readonly itinerary: Itinerary; readonly added: number } {
  let itinerary = start;
  const before = essentialsLeftOut(input, start).length;
  for (let round = 0; round < ROUNDS; round += 1) {
    let moved = false;
    for (const gap of essentialsLeftOut(input, itinerary)) {
      const poi = input.pois.get(gap.poiId);
      if (poi === undefined || (gap.reason !== 'no_room' && gap.reason !== 'held_in_the_way')) {
        continue;
      }
      const placed = placeOne(input, outlines, itinerary, poi, round);
      if (placed === null) continue;
      itinerary = placed;
      moved = true;
    }
    if (!moved) break;
  }
  // Never worse off than it started: a round that only shuffled is undone.
  const after = essentialsLeftOut(input, itinerary).length;
  return after < before ? { itinerary, added: before - after } : { itinerary: start, added: 0 };
}

/** Seats tried for a place added to a day, in order. */
const SEATS_TRIED = 3;

/**
 * Where in day `dayNo`'s order `poi` adds the least riding: first of all for a place that opens
 * the day, else the seats between the stops it is least out of the way of.
 */
function bestSeats(input: DraftPlanInput, plan: Itinerary, dayNo: number, poi: DraftPoi): number[] {
  const items = plan.days.find((d) => d.day_no === dayNo)?.items ?? [];
  const ids = items.map((item) => item.poi_id);
  const leg = (a: string | null | undefined, b: string | null | undefined) =>
    a == null || b == null ? 0 : (input.travel(a, b) ?? 0);
  const added = (at: number) =>
    leg(ids[at - 1], poi.id) + leg(poi.id, ids[at]) - leg(ids[at - 1], ids[at]);
  const seats = Array.from({ length: items.length + 1 }, (_, at) => at).sort(
    (a, b) => added(a) - added(b) || a - b,
  );
  const reach = { homeId: homeOf(input), hopCapMin: hopCap(input), travel: input.travel };
  const first = opensDay(poi, reach) ? [0] : [];
  return [...new Set([...first, ...seats])].slice(0, SEATS_TRIED + first.length);
}

function placeOne(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  itinerary: Itinerary,
  poi: DraftPoi,
  round: number,
): Itinerary | null {
  const essential = new Map(essentialsOf(input).map((other) => [other.id, other]));
  const open = input.pools.openDays.get(poi.id) ?? [];
  const days = itinerary.days
    .filter((day) => open.includes(day.day_no))
    .map((day) => {
      const here = day.items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));
      return { day, near: nearFirst(input, [poi], here).length > 0 ? 0 : 1 };
    })
    .sort((a, b) => a.near - b.near || a.day.items.length - b.day.items.length);
  // As clean as it was, and no sight that should open the day left behind another.
  const clean = (
    was: { hard: number; meals: number },
    now: { hard: number; meals: number },
    made: DraftDay,
  ) => now.hard <= was.hard && now.meals <= was.meals && misplacedOpeners(input, made).length === 0;
  // First without touching another essential, on any day; then in a shorter essential's seat.
  for (const displace of [false, true]) {
    for (const { day } of days) {
      const outline = outlines.find((d) => d.dayNo === day.day_no);
      if (outline === undefined) continue;
      const fed = (candidate: Itinerary) => fillMeals(input, [outline], candidate).itinerary;
      const key = `essential-${round}-${day.day_no}-${poi.id}`;
      const tryOn = (
        plan: Itinerary,
        tag: string,
        baseline?: { hard: number; meals: number },
      ): Itinerary | null => {
        for (const at of bestSeats(input, plan, day.day_no, poi)) {
          const made = addOne(
            input,
            outline,
            plan,
            [poi],
            clean,
            `${key}-${tag}-${at}`,
            fed,
            baseline,
            at,
          );
          if (made !== null) return made;
        }
        return null;
      };
      if (!displace) {
        const added = tryOn(itinerary, 'add');
        if (added !== null) return added;
      }
      const baseline = dayFaults(input, itinerary, day.day_no);
      const giveWay = day.items
        .filter((item) => {
          if (isKept(item) || item.kind !== 'activity') return false;
          const other = essential.get(item.poi_id ?? '');
          return displace
            ? other !== undefined && other.durationMin < poi.durationMin
            : other === undefined;
        })
        .reverse();
      // One stop gives way; where the newcomer is long, two that nobody asked for.
      const sets = [
        ...giveWay.map((item) => [item]),
        ...(displace ? [] : giveWay.flatMap((a, i) => giveWay.slice(i + 1).map((b) => [a, b]))),
      ];
      for (const out of sets) {
        const gone = new Set(out.map((item) => item.stable_id));
        const lighter = {
          ...itinerary,
          days: itinerary.days.map((d) =>
            d.day_no === day.day_no
              ? { ...d, items: d.items.filter((i) => !gone.has(i.stable_id)) }
              : d,
          ),
        };
        const swapped = tryOn(lighter, `for-${[...gone].join('+')}`, baseline);
        if (swapped !== null) return swapped;
      }
    }
  }
  return null;
}
