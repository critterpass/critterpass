/**
 * Repair targeting: after validation only the days that broke a rule are drafted again, each with
 * the reasons in words the guide can act on. A must-do with no item goes to the lightest day it
 * can open on; a budget overrun goes to the costliest days until their cost covers the overrun.
 * When the repair loops are spent, `dropViolations` removes what still breaks a rule, and the
 * review shows what went missing.
 */
import type { Itinerary } from '@cp/domain';

import { dayMetrics } from './metrics';
import { isKept, type DraftPoi } from './types';
import type { DraftViolation, DraftViolationCode } from './validate-itinerary';

export interface RepairReason {
  readonly code: DraftViolationCode;
  readonly stableId: string | null;
  readonly poiId: string | null;
  readonly mustDoId: string | null;
  /** What to fix, in words; names places by name and id, never invents one. */
  readonly text: string;
}

export interface RepairTarget {
  readonly dayNo: number;
  readonly reasons: readonly RepairReason[];
}

export interface RepairTargetsInput {
  readonly itinerary: Itinerary;
  readonly violations: readonly DraftViolation[];
  readonly pois: ReadonlyMap<string, DraftPoi>;
  /** Days each placeable must-do's place is open on (from the candidate pools). */
  readonly mustDoDays: ReadonlyMap<string, readonly number[]>;
  readonly mustDoPoi: ReadonlyMap<string, string>;
  readonly crewSize: number;
}

const TEXT: Readonly<
  Record<DraftViolationCode, (name: string, violation: DraftViolation) => string>
> = {
  UNKNOWN_POI: () => 'One stop is not a place from the list. Use only ids from the list.',
  CLOSED_AT_TIME: (name) =>
    `${name} is closed at the time it landed. Move it or pick another place.`,
  CLOSED_ON_DATE: (name) => `${name} is closed on this date. Pick another place.`,
  OVERLAP: (name) => `${name} runs into the stop before it. Drop a stop or reorder.`,
  TRAVEL_TOO_LONG: (name) => `Getting to ${name} takes longer than the gap. Pick closer stops.`,
  OFF_GRID: (name) => `${name} is off the plan grid. Keep the order simple.`,
  DAY_OVERRUN: (name) => `${name} runs past the end of the day. Use fewer stops.`,
  FLIGHT_BUFFER: (name) => `${name} is too close to the flight. Use fewer stops on this day.`,
  WRONG_TIME_OF_DAY: (name) =>
    `${name} is held to its time of day and landed at another. Put a sunrise stop first and a night stop last, with fewer stops around it.`,
  DIETARY: (name) => `${name} does not suit the crew's diets. Pick a meal place that does.`,
  DUPLICATE_PLACE: (name) => `${name} is already on another day. Pick a different place.`,
  EXTRA_MEAL: (name) =>
    `${name} is a second meal in the same stretch. Keep one lunch and one dinner.`,
  MEAL_OFF_HOURS: (name) =>
    `${name} is a meal that landed between meal times. Put lunch after the morning's stops and dinner at the end of the day.`,
  MEAL_MISSING: (_name, violation) =>
    violation.slot === 'dinner'
      ? 'The day has no dinner. Add a dinner place from the meal list at the end of the day.'
      : 'The day has no lunch. Add a lunch place from the meal list in the middle of the day.',
  REPEAT_DISH: (name) =>
    `${name} serves what the crew already eats that day or the day before. Pick a meal place with another dish.`,
  LONG_HOP: (name) =>
    `${name} is a long ride from the stops around it. Pick a place near the others, or leave it out.`,
  CROWDED_LONG_VISIT: (name) =>
    `${name} crowds a place that takes half the day or all of it. Give the long visit its time: move ${name} to another day, or leave it out.`,
  OFF_THE_OUTING: (name) =>
    `${name} is back in town on a day out. Keep the day to the outing's places and meals near them.`,
  INSIDE_ANOTHER_STOP: (name) =>
    `${name} is inside a bigger place on this day, and its visit takes it in. Leave ${name} out.`,
  MUST_DO_MISSING: (name) => `${name} is a must-do and is missing. Fit it into this day.`,
  OVER_BUDGET: () => 'The trip is over budget. Pick cheaper stops on this day.',
};

function nameOf(pois: ReadonlyMap<string, DraftPoi>, poiId: string | undefined): string {
  if (poiId === undefined) return 'This stop';
  const poi = pois.get(poiId);
  return poi === undefined ? 'This stop' : poi.name;
}

export function repairTargets(input: RepairTargetsInput): RepairTarget[] {
  const byDay = new Map<number, RepairReason[]>();
  const add = (dayNo: number, reason: RepairReason) => {
    byDay.set(dayNo, [...(byDay.get(dayNo) ?? []), reason]);
  };
  const metrics = new Map(
    input.itinerary.days.map((day) => [day.day_no, dayMetrics(day, input.crewSize)]),
  );
  const load = (dayNo: number) => metrics.get(dayNo)?.active_min ?? 0;
  for (const violation of input.violations) {
    const text = TEXT[violation.code];
    if (violation.code === 'MUST_DO_MISSING' && violation.mustDoId !== undefined) {
      const days = input.mustDoDays.get(violation.mustDoId) ?? [];
      const lightest = [...days].sort((a, b) => load(a) - load(b) || a - b)[0];
      if (lightest === undefined) continue;
      const poiId = input.mustDoPoi.get(violation.mustDoId) ?? null;
      add(lightest, {
        code: violation.code,
        stableId: null,
        poiId,
        mustDoId: violation.mustDoId,
        text: text(nameOf(input.pois, poiId ?? undefined), violation),
      });
      continue;
    }
    if (violation.code === 'OVER_BUDGET') {
      let left = violation.amount ?? 0;
      const costly = [...metrics.values()].sort(
        (a, b) => b.cost_pp_minor - a.cost_pp_minor || a.day_no - b.day_no,
      );
      for (const day of costly) {
        if (left <= 0) break;
        add(day.day_no, {
          code: violation.code,
          stableId: null,
          poiId: null,
          mustDoId: null,
          text: text('', violation),
        });
        left -= day.cost_pp_minor;
      }
      continue;
    }
    if (violation.dayNo === null) continue;
    add(violation.dayNo, {
      code: violation.code,
      stableId: violation.stableId,
      poiId: violation.poiId ?? null,
      mustDoId: violation.mustDoId ?? null,
      text: text(nameOf(input.pois, violation.poiId), violation),
    });
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayNo, reasons]) => ({ dayNo, reasons }));
}

/**
 * Item-level codes that drop the item once repairs are spent (trip-wide ones only flag). A must-do
 * planned at another time of day than it is held to is kept: the review shows it, off its time.
 */
const DROPPED_CODES: ReadonlySet<DraftViolationCode> = new Set([
  'UNKNOWN_POI',
  'CLOSED_AT_TIME',
  'CLOSED_ON_DATE',
  'OVERLAP',
  'TRAVEL_TOO_LONG',
  'OFF_GRID',
  'DAY_OVERRUN',
  'FLIGHT_BUFFER',
  'DIETARY',
  'DUPLICATE_PLACE',
  'EXTRA_MEAL',
  'MEAL_OFF_HOURS',
  'REPEAT_DISH',
  'LONG_HOP',
  'CROWDED_LONG_VISIT',
  'OFF_THE_OUTING',
  'INSIDE_ANOTHER_STOP',
]);

export interface DropResult {
  readonly itinerary: Itinerary;
  readonly dropped: readonly { readonly stableId: string; readonly mustDoId: string | null }[];
}

/**
 * Removes every item that still breaks an item-level rule. A stop that is not a must-do and
 * landed outside the time of day its place is for goes too.
 */
export function dropViolations(
  itinerary: Itinerary,
  violations: readonly DraftViolation[],
): DropResult {
  const flagged = (codes: (code: DraftViolationCode) => boolean) =>
    new Set(
      violations
        .filter((v) => codes(v.code) && v.stableId !== null)
        .map((v) => v.stableId as string),
    );
  const bad = flagged((code) => DROPPED_CODES.has(code));
  const offTime = flagged((code) => code === 'WRONG_TIME_OF_DAY');
  const dropped: { stableId: string; mustDoId: string | null }[] = [];
  const days = itinerary.days.map((day) => ({
    ...day,
    items: day.items.filter((item) => {
      // A booking or a stop the organiser placed is theirs to move: it stays, fault and all.
      const theirs = item.must_do_id === null && item.locked_reason !== null;
      const goes =
        !theirs && (bad.has(item.stable_id) || (offTime.has(item.stable_id) && !isKept(item)));
      if (!goes) return true;
      dropped.push({ stableId: item.stable_id, mustDoId: item.must_do_id });
      return false;
    }),
  }));
  return { itinerary: { ...itinerary, days }, dropped };
}
