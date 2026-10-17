/**
 * Agreed coffee and snack stops. Pages send a first visit to the same few cafés and snack stalls
 * (egg coffee at Giảng, the bagel shop on Brick Lane), as they do to the same meals. A break pages
 * agree on (./agreement) that the draft lacks gets a day in its own area. On a day with no break
 * it goes on the way between two stops before dinner (a short stop: one over the day's stop
 * budget), else in the seat of a stop nobody agreed on or asked for; on a day with one, in the
 * seat of a break pages agree on less that suits the crew no better. Those pages agree on most go
 * first, then those that suit the crew's tastes. A day keeps one break, its areas and its shape
 * (./agreed-sights).
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import { dayWindow, detourMin, foodRole, isKept, tasteScore, type DraftPoi } from '@cp/planner';

import { agreementOf, agreementOfStop } from './agreement';
import { fillersOf, placesOf, seatBeforeDinner, seatKeepingShape } from './agreed-sights';
import { areaStep, dayOutOf, rideFrom } from './areas';
import { stopBudget } from './budget';
import type { Attempt } from './complete-days';
import type { DraftPlanInput } from './context';
import type { SkeletonDay } from './skeleton';

/** Days tried for one break, and seats tried on a day, the best first. */
const DAYS_TRIED = 3;
const SEATS_TRIED = 3;

const isBreak = (poi: DraftPoi | undefined): poi is DraftPoi =>
  poi !== undefined && foodRole(poi) === 'light';

/** The agreed breaks no day holds: those pages agree on most first, then the crew's tastes. */
function agreedLeftOut(input: DraftPlanInput, plan: Itinerary): DraftPoi[] {
  const used = new Set(plan.days.flatMap(placesOf));
  return [...new Set([...input.pools.activities, ...input.pools.breaks])]
    .filter((poi) => isBreak(poi) && !used.has(poi.id) && agreementOf(input, poi) < 2)
    .sort(
      (a, b) =>
        agreementOf(input, a) - agreementOf(input, b) ||
        tasteScore(b, input.tastes) - tasteScore(a, input.tastes) ||
        (b.blogCount ?? 0) - (a.blogCount ?? 0),
    );
}

/** Seats before dinner on `day` for `poi`, the smallest detour from the stops around it first. */
function seatsFor(input: DraftPlanInput, day: DraftDay, poi: DraftPoi): number[] {
  const cost = (at: number) => {
    const [a, b] = [day.items[at - 1]?.poi_id, day.items[at]?.poi_id];
    if (a != null && b != null) return detourMin(a, poi.id, b, input.travel);
    const near = a ?? b;
    return near == null ? 0 : 2 * (input.travel(near, poi.id) ?? 0);
  };
  return Array.from({ length: seatBeforeDinner(input, day) + 1 }, (_, at) => at)
    .sort((a, b) => cost(a) - cost(b) || a - b)
    .slice(0, SEATS_TRIED);
}

/** `poi` on the day of `outline`: added where it has no break, else in a lesser break's seat. */
function seatOn(
  input: DraftPlanInput,
  outline: SkeletonDay,
  plan: Itinerary,
  poi: DraftPoi,
): Itinerary | null {
  const day = plan.days.find((d) => d.day_no === outline.dayNo);
  if (day === undefined) return null;
  const held = day.items.find((item) => isBreak(input.pois.get(item.poi_id ?? '')));
  if (held === undefined) {
    const window = dayWindow(input.frame, outline.dayNo - 1);
    const room = day.items.length <= stopBudget(window.endMin - window.startMin);
    for (const position of room ? seatsFor(input, day, poi) : []) {
      const added = seatKeepingShape(input, outline, plan, poi, { position });
      if (added !== null) return added;
    }
    for (const filler of fillersOf(input, day)) {
      const swapped = seatKeepingShape(input, outline, plan, poi, {
        position: day.items.indexOf(filler),
        replacing: filler,
      });
      if (swapped !== null) return swapped;
    }
    return null;
  }
  const own = input.pois.get(held.poi_id ?? '');
  if (
    own === undefined ||
    isKept(held) ||
    agreementOfStop(input, held) <= agreementOf(input, poi) ||
    tasteScore(own, input.tastes) > tasteScore(poi, input.tastes)
  ) {
    return null;
  }
  return seatKeepingShape(input, outline, plan, poi, {
    position: day.items.indexOf(held),
    replacing: held,
  });
}

/** Gives each agreed break the draft left out a seat on a day in its area (see the file note). */
export function placeAgreedBreaks(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  start: Itinerary,
): Attempt {
  let itinerary = start;
  let added = 0;
  for (const poi of agreedLeftOut(input, start)) {
    const days = outlines
      .flatMap((outline) => {
        const day = itinerary.days.find((d) => d.day_no === outline.dayNo);
        if (day === undefined || day.items.length === 0) return [];
        if (dayOutOf(input, outline.dayNo).size > 0) return [];
        if (!(input.pools.openDays.get(poi.id) ?? []).includes(outline.dayNo)) return [];
        const here = placesOf(day);
        if (areaStep(input, poi.id, here) > 0) return [];
        const hasBreak = day.items.some((item) => isBreak(input.pois.get(item.poi_id ?? '')));
        return [{ outline, hasBreak, ride: rideFrom(input, poi.id, here) }];
      })
      .sort((a, b) => Number(a.hasBreak) - Number(b.hasBreak) || a.ride - b.ride)
      .slice(0, DAYS_TRIED);
    for (const { outline } of days) {
      const next = seatOn(input, outline, itinerary, poi);
      if (next === null) continue;
      itinerary = next;
      added += 1;
      break;
    }
  }
  return { itinerary, added };
}
