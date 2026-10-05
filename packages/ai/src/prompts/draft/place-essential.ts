/**
 * Putting one essential sight on a day: added where it rides least out of the way and the day
 * stays as clean; else in the seat of a stop nobody asked for; else in a shorter essential's seat
 * (which is placed again later). A long visit takes in the stops inside it, and a whole-day visit
 * the day's lunch stop, before it is tried.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import { isKept, minuteOfDate, opensDay, type DraftPoi } from '@cp/planner';

import { homeOf, hopCap, insideVisit, spanOf } from './areas';
import { addOne, dayFaults, fillMeals, nearFirst } from './complete-days';
import type { DraftPlanInput } from './context';
import { essentialsOf } from './essentials';
import { misplacedOpeners } from './openers';
import type { SkeletonDay } from './skeleton';

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

/** `poi` on one of the days in `outlines`; with `addOnly`, never in another stop's seat. */
export function placeOne(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  itinerary: Itinerary,
  poi: DraftPoi,
  round: number,
  addOnly = false,
): Itinerary | null {
  const essential = new Map(essentialsOf(input).map((other) => [other.id, other]));
  const open = input.pools.openDays.get(poi.id) ?? [];
  // A short outing that shares a day shares it with town, never with another day out.
  const ownOuting = input.pools.outings.find((outing) => outing.poiIds.includes(poi.id));
  const outingDays = new Set(
    input.pools.outings.filter((o) => o !== ownOuting && o.dayNo !== null).map((o) => o.dayNo),
  );
  const days = itinerary.days
    .filter(
      (day) =>
        open.includes(day.day_no) && (ownOuting === undefined || !outingDays.has(day.day_no)),
    )
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
        // The stops inside it (the bridge at the resort) give way to the visit that takes them in,
        // and a whole-day visit eats where it is: the day's lunch stop gives way too.
        const whole = spanOf(input, poi) === 'full';
        const inside = new Set(
          day.items
            .filter((item) => {
              const other = input.pois.get(item.poi_id ?? '');
              if (other === undefined || isKept(item) || item.must_do_id !== null) return false;
              const lunch =
                item.kind === 'meal' &&
                minuteOfDate(new Date(item.starts_at), day.date, input.frame.tz) < 15 * 60;
              return insideVisit(input, other, poi) || (whole && lunch);
            })
            .map((item) => item.stable_id),
        );
        if (inside.size > 0) {
          const opened = {
            ...itinerary,
            days: itinerary.days.map((d) =>
              d.day_no === day.day_no
                ? { ...d, items: d.items.filter((i) => !inside.has(i.stable_id)) }
                : d,
            ),
          };
          const taken = tryOn(opened, 'inside', dayFaults(input, itinerary, day.day_no));
          if (taken !== null) return taken;
        }
      }
      if (addOnly) continue;
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
