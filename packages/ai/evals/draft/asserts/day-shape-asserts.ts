/**
 * What a draft must look like beyond a clean validator, for the cases that ask for it. A picked
 * must-do is planned at the row everybody means (not the guesthouse next door that shares its
 * name); every full day of a real-city draft has its lunch, its dinner and enough to do; and a
 * redraft does what its reason chips say in the terms the planner can hold it to: a later start
 * opens the day later, and a slower or lighter day still eats when a place is free to feed it.
 */
import type { DraftDay, Itinerary, RedraftReasonKey } from '@cp/domain';
import { dayWindow, isKept, mealAt, mealSlots, mealsInWindow, minuteOfDate } from '@cp/planner';

import { spanOf } from '../../../src/prompts/draft/areas';
import type { DraftPlanInput } from '../../../src/prompts/draft/context';
import { titleFits } from '../../../src/prompts/draft/day-titles';
import { plannerLines } from '../../../src/prompts/draft/final-notes';
import { coreMustSees } from '../../../src/prompts/draft/must-sees';
import { isOutdoors, wantsIndoors } from '../../../src/prompts/draft/redraft-rain';
import type { DraftPlanResult } from '../../../src/prompts/draft/pipeline';
import { plannedRedraft, type RedraftOutcome } from '../../../src/prompts/draft/redraft';
import type { CrewCase } from '../cases';

/** Stops a full day must have, meals included. */
const FULL_DAY_STOPS = 4;

const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

function mealsOf(day: DraftDay, tz: string): Set<string> {
  return new Set(
    day.items.flatMap((item) => {
      if (item.kind !== 'meal') return [];
      const slot = mealAt(minuteOfDate(new Date(item.starts_at), day.date, tz));
      return slot === null ? [] : [slot];
    }),
  );
}

/** Each picked must-do sits at one of the rows the case names for it. */
export function gradeMustDos(
  input: DraftPlanInput,
  itinerary: Itinerary,
  expected: CrewCase['expect_must_dos'],
  mustDoIdOf: (index: number) => string,
): string[] {
  return expected.flatMap((want) => {
    const mustDoId = mustDoIdOf(want.must_do);
    const item = itinerary.days.flatMap((day) => day.items).find((i) => i.must_do_id === mustDoId);
    if (item === undefined) return [`must-do ${want.must_do}: not placed`];
    return item.poi_id !== null && want.place_ids.includes(item.poi_id)
      ? []
      : [
          `must-do ${want.must_do}: planned at ${input.pois.get(item.poi_id ?? '')?.name ?? item.poi_id}`,
        ];
  });
}

/**
 * Every day between the first and the last has lunch, dinner and at least four stops; a day given
 * to one whole-day visit holds it and dinner, and eats lunch where it is.
 */
export function gradeFullDays(input: DraftPlanInput, result: DraftPlanResult): string[] {
  const days = result.itinerary.days;
  return days.flatMap((day, index) => {
    if (index === 0 || index === days.length - 1) return [];
    const meals = mealsOf(day, input.frame.tz);
    const whole = day.items.some((item) => {
      const poi = input.pois.get(item.poi_id ?? '');
      return item.kind !== 'meal' && poi !== undefined && spanOf(input, poi) === 'full';
    });
    if (whole) return meals.has('dinner') ? [] : [`day ${day.day_no}: no dinner`];
    const missing = (['lunch', 'dinner'] as const).filter((slot) => !meals.has(slot));
    return [
      ...missing.map((slot) => `day ${day.day_no}: no ${slot}`),
      ...(day.items.length < FULL_DAY_STOPS
        ? [`day ${day.day_no}: only ${day.items.length} stops`]
        : []),
    ];
  });
}

/** The redrafted day against its reason chips. */
export function gradeRedraftReasons(
  input: DraftPlanInput,
  base: Itinerary,
  dayNo: number,
  reasons: readonly RedraftReasonKey[],
  outcome: RedraftOutcome,
): string[] {
  const before = base.days.find((d) => d.day_no === dayNo);
  if (before === undefined) return [];
  const failures: string[] = [];
  const { tz } = input.frame;
  if (reasons.includes('later_start')) {
    const planned = plannedRedraft({ ...input, base, dayNo, reasons, note: null, chat: [] });
    const usual = dayWindow(input.frame, dayNo - 1).startMin;
    const later = dayWindow(planned.frame, dayNo - 1).startMin;
    if (later <= usual) failures.push(`later start: the day still opens at ${clock(usual)}`);
    const early = outcome.day.items.find(
      (item) =>
        item.must_do_id === null &&
        minuteOfDate(new Date(item.starts_at), outcome.day.date, tz) < later,
    );
    if (early !== undefined) {
      const at = minuteOfDate(new Date(early.starts_at), outcome.day.date, tz);
      failures.push(`later start: a stop at ${clock(at)}, before ${clock(later)}`);
    }
  }
  if (reasons.includes('slower') || reasons.includes('lighter_day')) {
    const had = mealsOf(before, tz);
    const has = mealsOf(outcome.day, tz);
    const used = new Set(
      outcome.itinerary.days.flatMap((day) => day.items.map((item) => item.poi_id)),
    );
    for (const slot of mealsInWindow(dayWindow(input.frame, dayNo - 1))) {
      if (!had.has(slot) || has.has(slot)) continue;
      // Lost only when a place that serves the meal was still free to take it.
      const free = input.pools.eateries.filter(
        (poi) =>
          !used.has(poi.id) &&
          (input.pools.openDays.get(poi.id) ?? []).includes(dayNo) &&
          mealSlots(poi, before.date).includes(slot),
      );
      if (free.length > 0) failures.push(`slower: the day lost its ${slot}`);
    }
  }
  return failures;
}

/** Every day's title still matches its stops, and the last day stays where the crew leaves from. */
export function gradeDayFinish(input: DraftPlanInput, itinerary: Itinerary): string[] {
  const failures: string[] = [];
  const last = itinerary.days[itinerary.days.length - 1];
  for (const day of itinerary.days) {
    if (!titleFits(input, day))
      failures.push(`day ${day.day_no}: title "${day.theme}" names what the day lacks`);
  }
  if (last !== undefined && itinerary.days.length > 1) {
    for (const item of last.items) {
      const open = item.poi_id === null ? undefined : input.pools.openDays.get(item.poi_id);
      if (isKept(item) || open === undefined || open.includes(last.day_no)) continue;
      failures.push(
        `last day: ${input.pois.get(item.poi_id ?? '')?.name ?? 'a stop'} is far from home`,
      );
    }
  }
  return failures;
}

/**
 * The organiser's own stops are where she put them, and the day is planned around them: nothing
 * else at their hours or their places, and no second meal beside a meal of hers.
 */
export function gradeHeld(input: DraftPlanInput, itinerary: Itinerary): string[] {
  const failures: string[] = [];
  const { tz } = input.frame;
  for (const { dayNo, item: own } of input.held ?? []) {
    const day = itinerary.days.find((d) => d.day_no === dayNo);
    const kept = day?.items.find((item) => item.stable_id === own.stable_id);
    const name = input.pois.get(own.poi_id ?? '')?.name ?? 'her stop';
    if (day === undefined || kept === undefined) {
      failures.push(`held: ${name} is gone from day ${dayNo}`);
      continue;
    }
    if (kept.poi_id !== own.poi_id) failures.push(`held: ${name} changed its place`);
    if (kept.starts_at !== own.starts_at || kept.ends_at !== own.ends_at)
      failures.push(`held: ${name} was moved`);
    if (kept.locked_reason !== 'user') failures.push(`held: ${name} lost its lock`);
    const others = day.items.filter((item) => item.stable_id !== own.stable_id);
    if (
      others.some(
        (item) =>
          Date.parse(item.starts_at) < Date.parse(own.ends_at) &&
          Date.parse(item.ends_at) > Date.parse(own.starts_at),
      )
    )
      failures.push(`held: a stop overlaps ${name}`);
    const again = itinerary.days
      .flatMap((d) => d.items)
      .filter(
        (item) =>
          own.poi_id !== null && item.poi_id === own.poi_id && item.stable_id !== own.stable_id,
      );
    if (again.length > 0) failures.push(`held: ${name} is planned a second time`);
    const slot = mealAt(minuteOfDate(new Date(own.starts_at), day.date, tz));
    if (own.kind === 'meal' && slot !== null) {
      const second = others.some(
        (item) =>
          item.kind === 'meal' &&
          mealAt(minuteOfDate(new Date(item.starts_at), day.date, tz)) === slot,
      );
      if (second) failures.push(`held: a second ${slot} beside ${name}`);
    }
  }
  return failures;
}

/** The draft holds enough of the places people come for, and no unexplained hole on a full day. */
export function gradeMustSees(
  input: DraftPlanInput,
  itinerary: Itinerary,
  atLeast: number,
): string[] {
  if (atLeast === 0) return [];
  const core = new Set(coreMustSees(input));
  const held = itinerary.days.flatMap((d) => d.items).filter((item) => core.has(item.poi_id ?? ''));
  return held.length >= atLeast
    ? []
    : [`must-sees: only ${held.length} of the trip's core ${core.size} (at least ${atLeast})`];
}

/** No two hours with nothing planned before dinner on a full day, unless the day says so. */
export function gradeHoles(input: DraftPlanInput, itinerary: Itinerary): string[] {
  const { tz } = input.frame;
  const free = plannerLines(input.locale).freeTime;
  return itinerary.days.flatMap((day, index) => {
    if (index === 0 || index === itinerary.days.length - 1) return [];
    return day.items.flatMap((item, at) => {
      const next = day.items[at + 1];
      if (next === undefined) return [];
      const from = minuteOfDate(new Date(item.ends_at), day.date, tz);
      const to = minuteOfDate(new Date(next.starts_at), day.date, tz);
      if (to > 20 * 60 + 30 || to - from - next.travel_min < 120) return [];
      return (item.note ?? '').includes(free)
        ? []
        : [
            `day ${day.day_no}: ${to - from - next.travel_min} minutes empty before ${Math.floor(to / 60)}:${String(to % 60).padStart(2, '0')}`,
          ];
    });
  });
}

/** A day redrafted for rain keeps no stop in the open air without saying nothing indoors is near. */
export function gradeRain(
  input: DraftPlanInput,
  note: string | null,
  outcome: RedraftOutcome,
): string[] {
  if (!wantsIndoors({ note })) return [];
  const line = plannerLines(input.locale).outdoors;
  return outcome.day.items.flatMap((item) => {
    const poi = input.pois.get(item.poi_id ?? '');
    if (poi === undefined || isKept(item) || !isOutdoors(poi)) return [];
    return (item.note ?? '').includes(line) ? [] : [`rain: ${poi.name} is outdoors, unexplained`];
  });
}
