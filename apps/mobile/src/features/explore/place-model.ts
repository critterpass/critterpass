/**
 * The place page's rules, apart from any rendering: whether the place is open, closed on the
 * chosen date or open round the clock, the crowd columns for the waking hours, the "go before"
 * advice from the quiet window, what ADD TO DAY offers, and the plan change it sends (the
 * organiser's edit, or the same addition as a change for the crew to okay).
 */
import {
  knownHours,
  openAt,
  toLocalWallTime,
  WEEKDAYS,
  type ChangeSetOp,
  type PlaceContextWire,
  type PlanOp,
} from '@cp/domain';

import { noonUtc } from './format';

export type OpenState = 'always' | 'open' | 'closed' | 'unknown';

const ALL_DAY = { start: '00:00', end: '24:00' };

/** How the place stands at `now` in its own time zone; unknown hours never read as closed. */
export function openState(stored: unknown, tz: string | null, now: Date): OpenState {
  const hours = knownHours(stored);
  if (hours === null || tz === null) return 'unknown';
  const roundTheClock = WEEKDAYS.every((day) =>
    (hours.weekly[day] ?? []).some(
      (span) => span.start === ALL_DAY.start && span.end === ALL_DAY.end,
    ),
  );
  if (roundTheClock && (hours.exceptions ?? []).length === 0) return 'always';
  return openAt(hours, tz, now) ? 'open' : 'closed';
}

/** True when the known hours have nothing on `date` (`YYYY-MM-DD`): the crowd chart gives way. */
export function closedOn(stored: unknown, date: string): boolean {
  const hours = knownHours(stored);
  if (hours === null) return false;
  const exception = hours.exceptions?.find((candidate) => candidate.date === date);
  if (exception !== undefined) return exception.spans.length === 0;
  // Monday-first, as the stored week is; a calendar date has the same weekday in every zone.
  const weekday = WEEKDAYS[(noonUtc(date).getUTCDay() + 6) % 7];
  return weekday === undefined || (hours.weekly[weekday] ?? []).length === 0;
}

export interface CrowdColumn {
  readonly hour: number;
  /** 0–1. */
  readonly level: number;
}

export const CROWD_FROM_HOUR = 6;
export const CROWD_TO_HOUR = 20;

/** The waking hours' columns from a 24-hour forecast (0–100 each); none without a full day. */
export function crowdColumns(hourly: readonly number[] | null | undefined): CrowdColumn[] {
  if (hourly === null || hourly === undefined || hourly.length !== 24) return [];
  const columns: CrowdColumn[] = [];
  for (let hour = CROWD_FROM_HOUR; hour <= CROWD_TO_HOUR; hour += 1) {
    columns.push({ hour, level: Math.min(1, Math.max(0, (hourly[hour] ?? 0) / 100)) });
  }
  return columns;
}

/** The whole hours a quiet window covers (`06:00`–`07:30` is 6 and 7). */
export function windowHours(
  window: { readonly start: string; readonly end: string } | null,
): number[] {
  if (window === null) return [];
  const from = Number(window.start.slice(0, 2));
  const [endHour, endMinute] = window.end.split(':').map(Number);
  const to = (endHour ?? from) + ((endMinute ?? 0) > 0 ? 1 : 0);
  return Array.from({ length: Math.max(0, to - from) }, (_, index) => from + index);
}

export type GoAdvice =
  | { readonly kind: 'before'; readonly time: string }
  | { readonly kind: 'after'; readonly time: string }
  | { readonly kind: 'around'; readonly time: string };

const EARLY = '08:00';
const LATE = '18:00';

/**
 * The quiet window as one instruction: a morning window says when to be done by, an evening one
 * when to arrive, anything else the hour to aim for. Times are local `HH:MM`.
 */
export function goAdvice(
  window: { readonly start: string; readonly end: string } | null,
): GoAdvice | null {
  if (window === null) return null;
  if (window.start <= EARLY) return { kind: 'before', time: window.end };
  if (window.start >= LATE) return { kind: 'after', time: window.start };
  return { kind: 'around', time: window.start };
}

export type AddState =
  /** No trip in context, or the trip has no plan to add to. */
  | { readonly kind: 'none' }
  | { readonly kind: 'planned'; readonly dayNo: number }
  /** The plan has no free slot for it: nothing to tap. */
  | { readonly kind: 'full' }
  | {
      readonly kind: 'add';
      readonly dayNo: number;
      /** Local `HH:MM` in the trip's zone. */
      readonly time: string;
      readonly mode: 'apply' | 'changeset';
    };

/** What the ADD TO DAY button shows; `addedDay` is a day this screen just added the place to. */
export function addState(
  context: PlaceContextWire | null,
  tz: string | null,
  addedDay: number | null,
): AddState {
  if (addedDay !== null) return { kind: 'planned', dayNo: addedDay };
  if (context === null || context.base_version === null) return { kind: 'none' };
  if (context.in_plan !== null) return { kind: 'planned', dayNo: context.in_plan.day_no };
  const slot = context.suggested_slot;
  if (slot === null) return { kind: 'full' };
  return {
    kind: 'add',
    dayNo: slot.day_no,
    time: toLocalWallTime(new Date(slot.starts_at), tz ?? 'UTC').time.slice(0, 5),
    mode: context.add_mode,
  };
}

export interface PlaceToAdd {
  readonly poiId: string;
  readonly category: string;
  readonly tz: string;
}

type Slot = NonNullable<PlaceContextWire['suggested_slot']>;

function snapshot(slot: Slot, place: PlaceToAdd) {
  return {
    day_no: slot.day_no,
    starts_at: slot.starts_at,
    ends_at: slot.ends_at,
    tz: place.tz,
    status: 'confirmed' as const,
    poi_id: place.poiId,
    category: place.category,
  };
}

/** The organiser's direct edit: one `add` at the suggested slot. */
export function addPlanOp(slot: Slot, place: PlaceToAdd, stableId: string): PlanOp {
  return { op: 'add', item: stableId, new: snapshot(slot, place) };
}

/** A member's same addition, as a change for the whole crew to okay. */
export function addChangeSetOp(
  slot: Slot,
  place: PlaceToAdd,
  stableId: string,
  crew: readonly string[],
  reason: string,
): ChangeSetOp {
  return {
    op: 'add',
    target: stableId,
    after: snapshot(slot, place),
    reason,
    affected_user_ids: [...crew],
    booking_impact: false,
  };
}
