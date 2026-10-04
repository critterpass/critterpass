/**
 * What code does to the guide's outline before any day is drafted, so every day starts from a
 * list a person could follow. A planned stop stays only while the day can still be timed with it
 * (hours, meal times, the time of day a place is for) and it sits within reach of the day's other
 * stops. A day the outline left light is topped up from the unused activities near it, so no day
 * is a single stop beside a full one while there are places to go. Each day's meal places are the
 * best eateries near that day's stops (never the same place on two days, never a dish the day
 * before already has), and its spares are the unused activities near it.
 */
import {
  bestOrder,
  dayWindow,
  foodRole,
  mealSlots,
  mealsInWindow,
  sameDish,
  stopKind,
  withinReach,
  type DayChoice,
  type DayWindow,
  type DraftPoi,
} from '@cp/planner';

import { hopCap } from './areas';
import { stopBudget } from './budget';
import type { DraftPlanInput } from './context';
import { whenOf } from './wish-answers';

export interface OutlineDay {
  readonly dayNo: number;
  readonly date: string;
  readonly mustDoIds: string[];
  readonly poiIds: string[];
  readonly mealIds: string[];
  readonly spareIds: string[];
}

/** Activities a full day should hold at least, when there are places for them. */
const MIN_DAY_ACTIVITIES = 3;
const MEALS_PER_SLOT = 3;
const SPARES_PER_DAY = 4;

function mustDoChoices(input: DraftPlanInput, day: OutlineDay): DayChoice[] {
  return day.mustDoIds.flatMap((mustDoId): DayChoice[] => {
    const slot = input.pools.mustDos.find((s) => s.mustDoId === mustDoId);
    const poi = slot === undefined ? undefined : input.pois.get(slot.poiId);
    return poi === undefined
      ? []
      : [
          {
            poiId: poi.id,
            kind: stopKind(poi),
            mustDoId,
            note: null,
            when: whenOf(input, mustDoId),
          },
        ];
  });
}

const activity = (poiId: string): DayChoice => ({
  poiId,
  kind: 'activity',
  mustDoId: null,
  note: null,
});

/** The places a day is planned around: its must-dos' places and its planned stops. */
export function anchorsOf(input: DraftPlanInput, day: OutlineDay): string[] {
  return [...mustDoChoices(input, day).map((choice) => choice.poiId), ...day.poiIds];
}

/** Eateries the day could use for `slot`, the nearest part of the map first, best first within it. */
function eateriesFor(
  input: DraftPlanInput,
  day: OutlineDay,
  slot: 'lunch' | 'dinner',
  anchors: readonly string[],
): DraftPoi[] {
  const cap = hopCap(input);
  const mustDoPlaces = new Set(input.pools.mustDos.map((s) => s.poiId));
  const ring = (poi: DraftPoi) =>
    withinReach(poi.id, anchors, input.travel, Math.round(cap / 2))
      ? 0
      : withinReach(poi.id, anchors, input.travel, cap)
        ? 1
        : 2;
  return input.pools.eateries
    .filter(
      (poi) =>
        !mustDoPlaces.has(poi.id) &&
        (input.pools.openDays.get(poi.id) ?? []).includes(day.dayNo) &&
        mealSlots(poi, day.date).includes(slot),
    )
    .map((poi, rank) => ({ poi, rank, ring: ring(poi) }))
    .filter((entry) => entry.ring < 2)
    .sort((a, b) => a.ring - b.ring || a.rank - b.rank)
    .map((entry) => entry.poi);
}

/** Stand-ins for the day's meals while sizing it: the nearest place that serves each meal. */
function mealProxies(input: DraftPlanInput, day: OutlineDay, window: DayWindow): DayChoice[] {
  const anchors = anchorsOf(input, day);
  const taken = new Set<string>();
  return mealsInWindow(window).flatMap((slot): DayChoice[] => {
    const poi = eateriesFor(input, day, slot, anchors).find((p) => !taken.has(p.id));
    if (poi === undefined) return [];
    taken.add(poi.id);
    return [{ poiId: poi.id, kind: 'meal', mustDoId: null, note: null }];
  });
}

/** Meals a day window runs through (lunch, dinner). */
export function mealsIn(window: DayWindow): number {
  return mealsInWindow(window).length;
}

/** Whether the day can still be timed with `poiIds` as its planned stops. */
function fits(input: DraftPlanInput, day: OutlineDay, poiIds: readonly string[]): boolean {
  const window = dayWindow(input.frame, day.dayNo - 1);
  const fixed = mustDoChoices(input, day);
  const proxies = mealProxies(input, { ...day, poiIds: [...poiIds] }, window);
  const choices = [...fixed, ...proxies, ...poiIds.map(activity)];
  if (fixed.length + poiIds.length + mealsIn(window) > stopBudget(window.endMin - window.startMin))
    return false;
  if (poiIds.filter((id) => isBreak(input, id)).length > 1) return false;
  return (
    bestOrder({
      date: day.date,
      choices,
      pois: input.pois,
      window,
      travel: input.travel,
      hopCapMin: hopCap(input),
    }).broken === 0
  );
}

function isBreak(input: DraftPlanInput, poiId: string): boolean {
  const poi = input.pois.get(poiId);
  return poi !== undefined && foodRole(poi) === 'light';
}

/** Keeps each day's planned stops only while the day still fits; the rest go back to the pool. */
export function keepWhatFits(
  input: DraftPlanInput,
  days: readonly OutlineDay[],
  taken: Set<string>,
): void {
  for (const day of days) {
    const keep: string[] = [];
    for (const id of day.poiIds) {
      if (fits(input, day, [...keep, id])) keep.push(id);
      else taken.delete(id);
    }
    day.poiIds.splice(0, day.poiIds.length, ...keep);
  }
}

/** Tops up light days from the unused activities near them, the lightest day first. */
export function topUpDays(
  input: DraftPlanInput,
  days: readonly OutlineDay[],
  taken: Set<string>,
): number {
  const cap = hopCap(input);
  let added = 0;
  const load = (day: OutlineDay) => day.mustDoIds.length + day.poiIds.length;
  for (const day of [...days].sort((a, b) => load(a) - load(b) || a.dayNo - b.dayNo)) {
    const window = dayWindow(input.frame, day.dayNo - 1);
    const room = stopBudget(window.endMin - window.startMin) - mealsIn(window);
    const target = Math.min(MIN_DAY_ACTIVITIES, Math.max(1, room));
    const tried = new Set<string>();
    while (load(day) < target) {
      const anchors = anchorsOf(input, day);
      const next = input.pools.activities.find(
        (poi) =>
          !taken.has(poi.id) &&
          !tried.has(poi.id) &&
          (input.pools.openDays.get(poi.id) ?? []).includes(day.dayNo) &&
          withinReach(poi.id, anchors, input.travel, cap),
      );
      if (next === undefined) break;
      tried.add(next.id);
      if (!fits(input, day, [...day.poiIds, next.id])) continue;
      day.poiIds.push(next.id);
      taken.add(next.id);
      added += 1;
    }
  }
  return added;
}

/** Each day's meal places: per meal the day runs through, the best few near its stops. */
export function assignMeals(input: DraftPlanInput, days: readonly OutlineDay[]): void {
  const listed = new Set<string>();
  const place = (id: string) => input.pois.get(id);
  const eaten = (day: OutlineDay | undefined): DraftPoi[] =>
    day === undefined
      ? []
      : [...mustDoChoices(input, day).map((c) => c.poiId), ...day.mealIds]
          .map(place)
          .filter((poi): poi is DraftPoi => poi !== undefined && foodRole(poi) === 'meal');
  for (const day of [...days].sort((a, b) => a.dayNo - b.dayNo)) {
    const window = dayWindow(input.frame, day.dayNo - 1);
    const anchors = anchorsOf(input, day);
    const around = [
      ...eaten(days.find((d) => d.dayNo === day.dayNo - 1)),
      ...eaten(days.find((d) => d.dayNo === day.dayNo + 1)).filter((poi) =>
        input.pools.mustDos.some((slot) => slot.poiId === poi.id),
      ),
    ];
    for (const slot of mealsInWindow(window)) {
      let count = 0;
      for (const poi of eateriesFor(input, day, slot, anchors)) {
        if (count >= MEALS_PER_SLOT) break;
        if (listed.has(poi.id)) continue;
        const mine = eaten(day);
        if ([...around, ...mine].some((other) => sameDish(other, poi))) continue;
        day.mealIds.push(poi.id);
        listed.add(poi.id);
        count += 1;
      }
    }
  }
}

/** Unused activities near each day, for when a planned one does not fit. */
export function assignSpares(
  input: DraftPlanInput,
  days: readonly OutlineDay[],
  taken: ReadonlySet<string>,
): void {
  const cap = hopCap(input);
  for (const poi of input.pools.activities) {
    if (taken.has(poi.id)) continue;
    const open = input.pools.openDays.get(poi.id) ?? [];
    const day = days
      .filter(
        (d) =>
          open.includes(d.dayNo) &&
          d.spareIds.length < SPARES_PER_DAY &&
          withinReach(poi.id, anchorsOf(input, d), input.travel, cap),
      )
      .sort((a, b) => a.spareIds.length - b.spareIds.length)[0];
    day?.spareIds.push(poi.id);
  }
}
