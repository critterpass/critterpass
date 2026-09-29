/**
 * The draft validator: every drafted item is checked against the places we know (no invented
 * ids), their opening hours in the place's zone, cited closures on the date, the travel matrix, the
 * 15-minute grid, the day's capacity (its usable window, including the flight buffers on the first
 * and last day), the crew's diets on every meal, one visit per place, must-do coverage and the
 * budget. Chronotype windows only make a plan tight, never invalid. Violations carry their day so
 * the repair pass can redo only the days that need it.
 */
import type { DraftItem, Itinerary } from '@cp/domain';

import { checkFeasibility } from '../feasibility/check';
import type { FeasibilityItem } from '../feasibility/types';
import { itineraryCostPpMinor } from './metrics';
import { baseWindow, dayWindow, minuteOfDate } from './schedule-day';
import type { DraftPoi, TravelMatrix, TripFrame } from './types';

export const DRAFT_VIOLATION_CODES = [
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
  /** Minutes short or over (travel, overlap); per-person amount over (budget). */
  readonly amount?: number;
}

export interface ValidateItineraryInput {
  readonly itinerary: Itinerary;
  readonly pois: ReadonlyMap<string, DraftPoi>;
  readonly frame: TripFrame;
  readonly travel: TravelMatrix;
  /** Must-dos that can be placed at all (a known place open on some trip date). */
  readonly requiredMustDoIds: readonly string[];
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

function dayChecks(
  input: ValidateItineraryInput,
  item: DraftItem,
  dayNo: number,
  dayIndex: number,
  date: string,
  seen: Set<string>,
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
  if (item.kind === 'meal' && !input.frame.diets.every((diet) => suitsDiet(poi.tags, diet))) {
    out.push(at('DIETARY'));
  }
  if (seen.has(poi.id)) out.push(at('DUPLICATE_PLACE'));
  seen.add(poi.id);
  const start = minuteOfDate(new Date(item.starts_at), date, input.frame.tz);
  const end = minuteOfDate(new Date(item.ends_at), date, input.frame.tz);
  const window = dayWindow(input.frame, dayIndex);
  if (start < window.startMin || end > window.endMin) {
    const base = baseWindow(input.frame);
    const inBase = start >= base.startMin && end <= base.endMin;
    out.push(at(inBase ? 'FLIGHT_BUFFER' : 'DAY_OVERRUN'));
  }
  return out;
}

export function validateItinerary(input: ValidateItineraryInput): ValidationResult {
  const violations: DraftViolation[] = [];
  const seen = new Set<string>();
  const dayOf = new Map<string, number>();
  const poiOf = new Map<string, string>();
  const feasibilityItems: FeasibilityItem[] = [];
  const dateIndex = new Map(input.frame.dates.map((date, index) => [date, index]));
  for (const day of input.itinerary.days) {
    const dayIndex = dateIndex.get(day.date) ?? day.day_no - 1;
    for (const item of day.items) {
      dayOf.set(item.stable_id, day.day_no);
      violations.push(...dayChecks(input, item, day.day_no, dayIndex, day.date, seen));
      const poi = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
      if (poi === undefined) continue;
      poiOf.set(item.stable_id, poi.id);
      feasibilityItems.push({
        stableId: item.stable_id,
        startsAt: new Date(item.starts_at),
        endsAt: new Date(item.ends_at),
        tz: poi.tz,
        dayNo: day.day_no,
        hours: poi.hours,
        mustDoId: item.must_do_id,
      });
    }
  }
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
