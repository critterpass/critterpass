/**
 * Add to plan (7f-1) as plain data: which day and time the block starts on (a preset from where the
 * sheet was opened, else Tokek's best day and time), how picking another day or time moves it, the
 * fit to show for the choice, and the plan ops ADD sends (the place, and the nearby place when
 * ticked). The same ops go out as an organiser's edit or, wrapped by the plan editor, as a member's
 * change set.
 */
import { toLocalWallTime, type DayFit, type PlaceFit, type PlanOp } from '@cp/domain';

import { instantOnDay } from '@/data/plan/plan-model';
import { addOp } from '@/data/plan/plan-ops';

/** Where the sheet was opened from, as its route params carry it. */
export interface AddPreset {
  /** A drop on a day (7f-2) or a fixer. */
  readonly dayNo?: number | undefined;
  /** Local minutes after midnight. */
  readonly startMin?: number | undefined;
  /** "+ right after this stop" (7e-2): the stop's day and end. */
  readonly after?: { readonly dayNo: number; readonly endMin: number } | undefined;
}

export interface AddChoice {
  readonly dayNo: number;
  readonly startMin: number;
  /** The person picked the time themselves: the reasons are worked out for it on the phone. */
  readonly timePicked: boolean;
}

export interface AddDay {
  readonly dayNo: number;
  readonly date: string;
}

/** A day with nothing to go on starts the block at 10:00. */
export const FALLBACK_START_MIN = 10 * 60;
/** How long a block lasts when no fit says so. */
export const FALLBACK_LENGTH_MIN = 90;

export function minutesOf(iso: string, tz: string): number {
  const [hour = 0, minute = 0] = toLocalWallTime(new Date(iso), tz).time.split(':').map(Number);
  return hour * 60 + minute;
}

export function dayFitOf(fit: PlaceFit | null, dayNo: number): DayFit | null {
  return fit?.days.find((day) => day.day_no === dayNo) ?? null;
}

/** The block's start on `dayNo`: that day's fitted slot, else `fallback`. */
function slotStart(fit: PlaceFit | null, dayNo: number, tz: string, fallback: number): number {
  const slot = dayFitOf(fit, dayNo)?.slot ?? null;
  return slot === null ? fallback : minutesOf(slot.starts_at, tz);
}

/**
 * The first choice: the preset when there is one (a drop keeps its day, a time keeps its time),
 * else Tokek's best day and time, else where the place already is (a place in the plan with no
 * better slot known), else the first day at 10:00 (nowhere fits yet).
 */
export function initialChoice(
  fit: PlaceFit | null,
  preset: AddPreset,
  days: readonly AddDay[],
  tz: string,
  existing: PlacedStop | null = null,
): AddChoice | null {
  const first = days[0];
  if (first === undefined) return null;
  if (preset.after !== undefined) {
    return { dayNo: preset.after.dayNo, startMin: preset.after.endMin, timePicked: true };
  }
  if (preset.dayNo !== undefined && days.some((day) => day.dayNo === preset.dayNo)) {
    if (preset.startMin !== undefined) {
      return { dayNo: preset.dayNo, startMin: preset.startMin, timePicked: true };
    }
    const fallback =
      existing !== null && existing.dayNo !== preset.dayNo ? existing.startMin : FALLBACK_START_MIN;
    return {
      dayNo: preset.dayNo,
      startMin: slotStart(fit, preset.dayNo, tz, fallback),
      timePicked: false,
    };
  }
  if (fit?.best !== null && fit?.best !== undefined) {
    return {
      dayNo: fit.best.day_no,
      startMin: minutesOf(fit.best.slot.starts_at, tz),
      timePicked: false,
    };
  }
  if (existing !== null) {
    return { dayNo: existing.dayNo, startMin: existing.startMin, timePicked: false };
  }
  return { dayNo: first.dayNo, startMin: FALLBACK_START_MIN, timePicked: false };
}

/** Where a place already sits in the plan. */
export interface PlacedStop {
  readonly stableId: string;
  readonly dayNo: number;
  readonly startMin: number;
}

/** The choice is exactly where the stop is now: there is nothing to move. */
export function isWhereItIs(choice: AddChoice | null, existing: PlacedStop | null): boolean {
  return (
    choice !== null &&
    existing !== null &&
    choice.dayNo === existing.dayNo &&
    choice.startMin === existing.startMin
  );
}

/** How close two spots are when the catalogue holds one place under two rows. */
const SAME_SPOT_DEG = 0.002;
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The plan's stop for a place: the same place id, or (the catalogue sometimes holds one place
 * twice) the same name on the same spot, so a place is never put in the plan a second time.
 */
export function stopOfPlace<
  Row extends {
    readonly stable_id: string;
    readonly poi_id: string | null;
    readonly poi_lat: number | null;
    readonly poi_lng: number | null;
  },
>(
  place: {
    readonly poiId: string | null;
    readonly name: string;
    readonly lat: number;
    readonly lng: number;
  },
  rows: readonly Row[],
  titleOf: (stableId: string) => string | null,
): Row | undefined {
  return (
    rows.find((row) => place.poiId !== null && row.poi_id === place.poiId) ??
    rows.find(
      (row) =>
        row.poi_lat !== null &&
        row.poi_lng !== null &&
        Math.abs(row.poi_lat - place.lat) < SAME_SPOT_DEG &&
        Math.abs(row.poi_lng - place.lng) < SAME_SPOT_DEG &&
        sameName(titleOf(row.stable_id) ?? '', place.name),
    )
  );
}

/** Another day: the block moves to that day's fitted time (or keeps its time when none fits). */
export function pickDay(choice: AddChoice, dayNo: number, fit: PlaceFit | null, tz: string) {
  const fitted = dayFitOf(fit, dayNo)?.slot ?? null;
  if (fitted === null) return { dayNo, startMin: choice.startMin, timePicked: choice.timePicked };
  return { dayNo, startMin: minutesOf(fitted.starts_at, tz), timePicked: false };
}

export function pickTime(choice: AddChoice, startMin: number): AddChoice {
  return { ...choice, startMin, timePicked: true };
}

/** How long the block runs: the fitted slot's length, else the usual visit. */
export function blockLength(fit: PlaceFit | null, dayNo: number): number {
  const slot = dayFitOf(fit, dayNo)?.slot ?? null;
  if (slot === null) return FALLBACK_LENGTH_MIN;
  return Math.max(15, Math.round((Date.parse(slot.ends_at) - Date.parse(slot.starts_at)) / 60_000));
}

/**
 * The fit to show for the choice: worked out on the phone for a picked time (`local`, judged at
 * that start), else the server's answer for that day.
 */
export function shownDayFit(
  choice: AddChoice,
  server: PlaceFit | null,
  local: PlaceFit | null,
): DayFit | null {
  if (choice.timePicked && local !== null) return dayFitOf(local, choice.dayNo);
  return dayFitOf(server, choice.dayNo) ?? dayFitOf(local, choice.dayNo);
}

/** Every day's grade for the chips' dots, from the server's fit. */
export function dayGrades(fit: PlaceFit | null): ReadonlyMap<number, DayFit['grade']> {
  return new Map((fit?.days ?? []).map((day) => [day.day_no, day.grade]));
}

export interface AddPlace {
  readonly poiId: string | null;
  readonly name: string;
  readonly category: string | null;
  /** A dropped pin's own spot: the stop carries it, as it has no place row. */
  readonly pin?: { readonly lat: number; readonly lng: number } | undefined;
}

export interface NearbyAdd {
  readonly poiId: string;
  readonly name: string;
  readonly category: string | null;
  /** Minutes from the block to it. */
  readonly minutes: number;
  readonly lengthMin: number;
}

export interface AddOpsInput {
  readonly choice: AddChoice;
  readonly day: AddDay;
  readonly tz: string;
  readonly place: AddPlace;
  readonly lengthMin: number;
  /** Who goes; empty = the whole crew. */
  readonly attendeeIds: readonly string[];
  readonly nearby: NearbyAdd | null;
  readonly stableIds: readonly [string, string];
}

function withAttendees(op: PlanOp, attendeeIds: readonly string[]): PlanOp {
  if (op.op !== 'add' || attendeeIds.length === 0) return op;
  return { ...op, new: { ...op.new, attendee_ids: [...attendeeIds] } };
}

function withPin(op: PlanOp, place: AddPlace): PlanOp {
  if (op.op !== 'add' || place.poiId !== null || place.pin === undefined) return op;
  return { ...op, new: { ...op.new, custom_place: { name: place.name, ...place.pin } } };
}

/** The ops ADD sends: the block, then the nearby place right after it when ticked. */
export function addOps(input: AddOpsInput): PlanOp[] {
  const { choice, day, tz, place, lengthMin, nearby, attendeeIds, stableIds } = input;
  const end = choice.startMin + lengthMin;
  const ops = [
    withPin(
      addOp(
        day,
        {
          title: place.poiId === null ? place.name : null,
          poiId: place.poiId,
          category: place.category,
          start: choice.startMin,
          end,
          tz,
        },
        stableIds[0],
      ),
      place,
    ),
  ];
  if (nearby !== null) {
    const start = end + nearby.minutes;
    ops.push(
      addOp(
        day,
        {
          title: null,
          poiId: nearby.poiId,
          category: nearby.category,
          start,
          end: start + nearby.lengthMin,
          tz,
        },
        stableIds[1],
      ),
    );
  }
  return ops.map((op) => withAttendees(op, attendeeIds));
}

/** "08:00" for local minutes. */
export function clockOf(minutes: number): string {
  const inDay = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`;
}

/** A place already in the plan: ADD becomes "Move it", one move of its stop to the choice. */
export function moveStopOps(
  stableId: string,
  choice: AddChoice,
  day: AddDay,
  tz: string,
  lengthMin: number,
): PlanOp[] {
  return [
    {
      op: 'move',
      item: stableId,
      new: {
        day_no: day.dayNo,
        starts_at: instantOnDay(day.date, choice.startMin, tz),
        ends_at: instantOnDay(day.date, choice.startMin + lengthMin, tz),
      },
    },
  ];
}
