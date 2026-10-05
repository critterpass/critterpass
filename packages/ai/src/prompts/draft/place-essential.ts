/**
 * Putting one essential sight on a day: added where it rides least out of the way and the day
 * stays as clean; else in the seat of a stop nobody asked for; else in a shorter essential's seat
 * (which is placed again later). A long visit takes in the stops inside it, and a whole-day visit
 * the day's lunch stop, before it is tried.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import {
  choicesOfDay,
  earlyNeed,
  rankedFirst,
  rankKey,
  isKept,
  minuteOfDate,
  opensDay,
  type DraftPoi,
} from '@cp/planner';

import { homeOf, hopCap, insideVisit, spanOf } from './areas';
import { addOne, dayFaults, fillMeals, nearFirst } from './complete-days';
import type { DraftPlanInput } from './context';
import { essentialsOf } from './essentials';
import { misplacedOpeners } from './openers';
import { scheduleChoices } from './day';
import type { SkeletonDay } from './skeleton';
import { validate } from './validate';

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
  const reach = { homeId: homeOf(input), hopCapMin: hopCap(input), travel: input.travel };
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
  // When it takes another essential's seat, the day of the worst-ranked one it outranks first.
  const worstOutranked = (d: DraftDay) =>
    Math.max(
      Number.NEGATIVE_INFINITY,
      ...d.items.flatMap((item) => {
        const other = essential.get(item.poi_id ?? '');
        return other !== undefined && rankedFirst(poi, other) === true ? [rankKey(other)] : [];
      }),
    );
  const byRank = [...days].sort((a, b) => worstOutranked(b.day) - worstOutranked(a.day));
  for (const displace of [false, true]) {
    for (const { day } of displace ? byRank : days) {
      const outline = outlines.find((d) => d.dayNo === day.day_no);
      if (outline === undefined) continue;
      // The stops the newcomer's day out leaves out of place (a bar back in town, a village
      // inside the resort) give way to it, and the meals are filled again.
      const fed = (candidate: Itinerary) =>
        fillMeals(input, [outline], withoutShapeFaults(input, outline, candidate, poi.id))
          .itinerary;
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
        // The day out this day is planned for: what the guide put there instead gives way to it,
        // all of it, and the rest of the day is filled again later.
        const own = input.pools.outings.some(
          (o) => o.dayNo === day.day_no && o.poiIds.includes(poi.id),
        );
        if (own) {
          const cleared = {
            ...itinerary,
            days: itinerary.days.map((d) =>
              d.day_no === day.day_no
                ? {
                    ...d,
                    // Its lunch too: one near the day out is found again.
                    items: d.items.filter(
                      (i) =>
                        isKept(i) ||
                        i.must_do_id !== null ||
                        (i.kind === 'meal' &&
                          minuteOfDate(new Date(i.starts_at), d.date, input.frame.tz) >= 15 * 60),
                    ),
                  }
                : d,
            ),
          };
          // A lunch may be missed coming back from it (the day's note says so): better than no
          // day out at all.
          const was = dayFaults(input, itinerary, day.day_no);
          const taken = tryOn(cleared, 'outing', { ...was, meals: was.meals + 1 });
          if (taken !== null) return taken;
        }
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
          // Our editors' rank decides first: a worse-ranked essential gives way, its day out
          // with it, and a better-ranked one never does. Then a shorter essential gives way, and
          // one that would open the day with a weaker need for its morning than this one has.
          const ranked = other === undefined ? null : rankedFirst(poi, other);
          if (displace && ranked !== null) return ranked;
          return displace
            ? other !== undefined &&
                (other.durationMin < poi.durationMin ||
                  (opensDay(poi, reach) &&
                    opensDay(other, reach) &&
                    !input.pools.outings.some(
                      (o) => o.dayNo === day.day_no && o.poiIds.includes(other.id),
                    ) &&
                    earlyNeed(other) < earlyNeed(poi)))
            : other === undefined;
        })
        .reverse();
      // One stop gives way (with the rest of its day out); where the newcomer is long, two that
      // nobody asked for.
      const withOuting = (item: (typeof day.items)[number]) => {
        const outing = input.pools.outings.find((o) => o.poiIds.includes(item.poi_id ?? ''));
        return outing === undefined
          ? [item]
          : day.items.filter(
              (i) => i === item || (!isKept(i) && outing.poiIds.includes(i.poi_id ?? '')),
            );
      };
      const sets = [
        ...giveWay.map((item) => (displace ? withOuting(item) : [item])),
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

/** Codes of a day's shape around its big stops (./validate-day-shape in the planner). */
const SHAPE_CODES: ReadonlySet<string> = new Set([
  'OFF_THE_OUTING',
  'FAR_AFTER_DAY_OUT',
  'INSIDE_ANOTHER_STOP',
  'CROWDED_LONG_VISIT',
]);

/**
 * The day of `outline` without the stops that break its shape once `keep` is on it: those come
 * off (never `keep`, a must-do, a stop of the crew's or another essential), and the rest are
 * timed again.
 */
function withoutShapeFaults(
  input: DraftPlanInput,
  outline: SkeletonDay,
  itinerary: Itinerary,
  keep: string,
): Itinerary {
  const day = itinerary.days.find((d) => d.day_no === outline.dayNo);
  if (day === undefined) return itinerary;
  const gone = new Set(
    validate(input, itinerary)
      .violations.filter(
        (v) => v.dayNo === outline.dayNo && SHAPE_CODES.has(v.code) && v.poiId !== keep,
      )
      .flatMap((v) => (v.stableId === null ? [] : [v.stableId])),
  );
  // Never another essential: those give way only by rank (see `placeOne`).
  const kept = day.items.filter(
    (item) =>
      !gone.has(item.stable_id) ||
      isKept(item) ||
      item.must_do_id !== null ||
      input.pois.get(item.poi_id ?? '')?.essential === true,
  );
  if (kept.length === day.items.length) return itinerary;
  const next = scheduleChoices(
    input,
    {
      ...outline,
      mustDoIds: kept.flatMap((item) => (item.must_do_id === null ? [] : [item.must_do_id])),
    },
    choicesOfDay({ items: kept }),
    `shape-${outline.dayNo}-${keep}`,
  );
  return {
    ...itinerary,
    days: itinerary.days.map((d) => (d.day_no === outline.dayNo ? { ...next, theme: d.theme } : d)),
  };
}
