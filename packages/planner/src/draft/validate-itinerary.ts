/**
 * The draft validator: every drafted item is checked against the places we know (no invented
 * ids), their opening hours in the place's zone, cited closures on the date, the travel matrix, the
 * 15-minute grid, the day's capacity (its usable window, including the flight buffers on the first
 * and last day), the crew's diets on every meal, must-do coverage and the budget, and against what
 * makes a day read like a day (./validate-day-sense: meals in meal stretches, no place or dish
 * twice, places at their time of day, no hop too far). Chronotype windows only make a plan tight,
 * never invalid. Violations carry their day so the repair pass can redo only the days that need it.
 */
import type { DraftItem, Itinerary } from '@cp/domain';

import { checkFeasibility } from '../feasibility/check';
import type { FeasibilityItem } from '../feasibility/types';
import { itineraryCostPpMinor } from './metrics';
import { baseWindow, dayWindow, minuteOfDate } from './schedule-day';
import { isKept, isTheirs, type DraftPoi, type TravelMatrix, type TripFrame } from './types';
import { daySenseViolations, type TimedDay, type TimedStop } from './validate-day-sense';
import { heldWindow, type StartWindow } from './wish-time';

export const DRAFT_VIOLATION_CODES = [
  'UNKNOWN_POI',
  'CLOSED_AT_TIME',
  'CLOSED_ON_DATE',
  'OVERLAP',
  'TRAVEL_TOO_LONG',
  'OFF_GRID',
  'DAY_OVERRUN',
  'FLIGHT_BUFFER',
  'WRONG_TIME_OF_DAY',
  'DIETARY',
  'DUPLICATE_PLACE',
  'EXTRA_MEAL',
  'MEAL_OFF_HOURS',
  'MEAL_MISSING',
  'REPEAT_DISH',
  'LONG_HOP',
  'MUST_DO_MISSING',
  'OVER_BUDGET',
] as const;
export type DraftViolationCode = (typeof DRAFT_VIOLATION_CODES)[number];

export interface DraftViolation {
  readonly code: DraftViolationCode;
  /** Null for trip-wide violations (a must-do with no item, the budget). */
  readonly dayNo: number | null;
  readonly stableId: string | null;
  readonly poiId?: string;
  readonly mustDoId?: string;
  /** Minutes short or over (travel, overlap, a hop); per-person amount over (budget). */
  readonly amount?: number;
  /** The meal a day is missing (`MEAL_MISSING`). */
  readonly slot?: 'lunch' | 'dinner';
}

export interface ValidateItineraryInput {
  readonly itinerary: Itinerary;
  readonly pois: ReadonlyMap<string, DraftPoi>;
  readonly frame: TripFrame;
  readonly travel: TravelMatrix;
  /** Must-dos that can be placed at all (a known place open on some trip date). */
  readonly requiredMustDoIds: readonly string[];
  /**
   * Meal places that suit the crew. With them a day that runs through lunch or dinner and has
   * neither is reported, as long as one of them could still serve it.
   */
  readonly mealPlaces?: readonly DraftPoi[];
  /** The longest ride between two stops of a day (./hops); without it hops are not checked. */
  readonly hopCapMin?: number;
  /** The place the crew sleeps near (./home): the ride out to a day's first stop then counts. */
  readonly homeId?: string | null;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly violations: readonly DraftViolation[];
  readonly costPpMinor: number;
}

const FEASIBILITY_CODES = new Map<string, DraftViolationCode>([
  ['CLOSED_AT_TIME', 'CLOSED_AT_TIME'],
  ['OVERLAP', 'OVERLAP'],
  ['TRAVEL_TOO_LONG', 'TRAVEL_TOO_LONG'],
  ['OFF_GRID', 'OFF_GRID'],
]);

/** Tags that make a place suit a diet (a vegan kitchen also suits vegetarians). */
export function suitsDiet(tags: readonly string[], diet: string): boolean {
  const accepted = [diet, `${diet}_options`, `diet:${diet}`];
  if (diet === 'vegetarian') accepted.push('vegan', 'vegan_options', 'diet:vegan');
  return tags.some((tag) => accepted.includes(tag));
}

export function closedOn(frame: TripFrame, poi: DraftPoi, date: string): 'poi' | 'area' | null {
  for (const closure of frame.closures) {
    if (date < closure.closed_from || date > closure.closed_to) continue;
    if (closure.poi_id === poi.id) return 'poi';
    if (closure.poi_id === null && poi.name.toLowerCase().includes(closure.area.toLowerCase())) {
      return 'area';
    }
  }
  return null;
}

/** The start window of an item that is a must-do held to its time of day, else null. */
function heldAt(
  input: ValidateItineraryInput,
  item: DraftItem,
  poi: DraftPoi,
  date: string,
): StartWindow | null {
  if (item.must_do_id === null) return null;
  const when = input.frame.mustDos.find((m) => m.id === item.must_do_id)?.when;
  return heldWindow(poi, date, when);
}

function dayChecks(
  input: ValidateItineraryInput,
  item: DraftItem,
  dayNo: number,
  dayIndex: number,
  date: string,
): DraftViolation[] {
  const out: DraftViolation[] = [];
  const at = (code: DraftViolationCode, extra: Partial<DraftViolation> = {}): DraftViolation => ({
    code,
    dayNo,
    stableId: item.stable_id,
    ...(item.poi_id === null ? {} : { poiId: item.poi_id }),
    ...extra,
  });
  const poi = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
  if (poi === undefined) return [at('UNKNOWN_POI')];
  if (closedOn(input.frame, poi, date) === 'poi') out.push(at('CLOSED_ON_DATE'));
  if (
    item.kind === 'meal' &&
    !isKept(item) &&
    !input.frame.diets.every((diet) => suitsDiet(poi.tags, diet))
  ) {
    out.push(at('DIETARY'));
  }
  const start = minuteOfDate(new Date(item.starts_at), date, input.frame.tz);
  const end = minuteOfDate(new Date(item.ends_at), date, input.frame.tz);
  const window = dayWindow(input.frame, dayIndex);
  // A must-do held to its time of day (a sunrise, a night show) may sit outside the usual day, up
  // to landing and the flight home; at any other time it is off its time, inside the usual day too.
  const held = heldAt(input, item, poi, date);
  if (held !== null && (start < held.fromMin || start > held.toMin)) {
    out.push(at('WRONG_TIME_OF_DAY'));
  }
  // A booking or a stop placed by hand is the crew's own call, whenever it is.
  if (isTheirs(item)) return out;
  const from = held === null ? window.startMin : (window.earliestMin ?? window.startMin);
  const until = held === null ? window.endMin : (window.latestMin ?? window.endMin);
  if (start < from || end > until) {
    const base = baseWindow(input.frame);
    const inBase = start >= base.startMin && end <= base.endMin;
    out.push(at(inBase ? 'FLIGHT_BUFFER' : 'DAY_OVERRUN'));
  }
  return out;
}

export function validateItinerary(input: ValidateItineraryInput): ValidationResult {
  const violations: DraftViolation[] = [];
  const timedDays: TimedDay[] = [];
  const dayOf = new Map<string, number>();
  const poiOf = new Map<string, string>();
  const feasibilityItems: FeasibilityItem[] = [];
  const dateIndex = new Map(input.frame.dates.map((date, index) => [date, index]));
  for (const day of input.itinerary.days) {
    const dayIndex = dateIndex.get(day.date) ?? day.day_no - 1;
    const stops: TimedStop[] = [];
    for (const item of day.items) {
      dayOf.set(item.stable_id, day.day_no);
      violations.push(...dayChecks(input, item, day.day_no, dayIndex, day.date));
      const poi = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
      if (poi === undefined) continue;
      poiOf.set(item.stable_id, poi.id);
      stops.push({
        item,
        poi,
        startMin: minuteOfDate(new Date(item.starts_at), day.date, input.frame.tz),
        endMin: minuteOfDate(new Date(item.ends_at), day.date, input.frame.tz),
        held: heldAt(input, item, poi, day.date) !== null,
      });
      feasibilityItems.push({
        stableId: item.stable_id,
        startsAt: new Date(item.starts_at),
        endsAt: new Date(item.ends_at),
        tz: poi.tz,
        dayNo: day.day_no,
        // Hours that are only a guess never count against a must-do held to its time of day.
        hours:
          isTheirs(item) ||
          (poi.hoursGuessed === true && heldAt(input, item, poi, day.date) !== null)
            ? null
            : poi.hours,
        mustDoId: item.must_do_id,
      });
    }
    stops.sort((a, b) => a.startMin - b.startMin);
    timedDays.push({
      dayNo: day.day_no,
      date: day.date,
      window: dayWindow(input.frame, dayIndex),
      stops,
    });
  }
  violations.push(
    ...daySenseViolations({
      days: timedDays,
      travel: input.travel,
      mealPlaces: input.mealPlaces,
      hopCapMin: input.hopCapMin,
      homeId: input.homeId,
    }),
  );
  const feasibility = checkFeasibility({
    items: feasibilityItems,
    members: input.frame.members,
    travel: (a, b) => {
      const from = poiOf.get(a);
      const to = poiOf.get(b);
      if (from === undefined || to === undefined || dayOf.get(a) !== dayOf.get(b)) return null;
      return input.travel(from, to);
    },
    mustDos: input.frame.mustDos
      .filter((mustDo) => input.requiredMustDoIds.includes(mustDo.id))
      .map((mustDo) => ({ id: mustDo.id, ownerId: mustDo.ownerId })),
  });
  for (const found of feasibility.violations) {
    if (found.code === 'MUST_DO_MISSING' && found.mustDoId !== undefined) {
      violations.push({
        code: 'MUST_DO_MISSING',
        dayNo: null,
        stableId: null,
        mustDoId: found.mustDoId,
      });
      continue;
    }
    const code = FEASIBILITY_CODES.get(found.code);
    if (code === undefined || found.stableId === null) continue;
    violations.push({
      code,
      dayNo: dayOf.get(found.stableId) ?? null,
      stableId: found.stableId,
      ...(poiOf.has(found.stableId) ? { poiId: poiOf.get(found.stableId) as string } : {}),
      ...(found.minutes === undefined ? {} : { amount: found.minutes }),
    });
  }
  const costPpMinor = itineraryCostPpMinor(input.itinerary, input.frame.members.length);
  const budget = input.frame.budgetPpMinor;
  if (budget !== null && costPpMinor > budget) {
    violations.push({
      code: 'OVER_BUDGET',
      dayNo: null,
      stableId: null,
      amount: costPpMinor - budget,
    });
  }
  violations.sort(
    (a, b) =>
      DRAFT_VIOLATION_CODES.indexOf(a.code) - DRAFT_VIOLATION_CODES.indexOf(b.code) ||
      (a.dayNo ?? 0) - (b.dayNo ?? 0) ||
      (a.stableId ?? '').localeCompare(b.stableId ?? ''),
  );
  return { ok: violations.length === 0, violations, costPpMinor };
}
