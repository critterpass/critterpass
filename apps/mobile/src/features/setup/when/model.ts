/**
 * The dates step as the screen draws it, from synced rows only: per-date counts
 * (`availability_summaries`: how many of the crew are free, never who) laid out as Monday-first
 * months, and the window options the server derived (`date_window_options`). Pure, so the scenes
 * and tests build it from fixed rows.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and date keys, never copy. */
import type { WindowOptionKind } from '@cp/domain';

import { parseIdList } from '../data/rows';

export interface SummaryRow {
  readonly date: string;
  readonly free_count: number;
  readonly maybe_count: number;
  readonly busy_count: number;
  readonly unknown_count: number;
  readonly member_count: number;
  readonly computed_at: string | null;
}

export interface OptionRow {
  readonly id: string;
  readonly position: number;
  readonly kind: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly free_count: number;
  readonly member_count: number;
  readonly missing_member_ids: string | null;
  readonly missed_must_do_ids: string | null;
  readonly ask_user_id: string | null;
  readonly ask_status: string | null;
  readonly price_delta_minor: number | null;
  readonly currency: string | null;
  readonly reason: string;
  readonly is_pick: number;
}

export type AskState = 'asked' | 'freed' | 'not_movable' | 'timed_out';

export interface WindowOption {
  readonly id: string;
  readonly kind: WindowOptionKind;
  readonly start: string;
  readonly end: string;
  readonly freeCount: number;
  readonly memberCount: number;
  readonly missingIds: readonly string[];
  readonly missedMustDoIds: readonly string[];
  readonly askUserId: string | null;
  readonly askState: AskState | null;
  readonly priceDeltaMinor: number | null;
  readonly currency: string | null;
  readonly reason: string;
  readonly isPick: boolean;
}

export interface HeatDay {
  readonly date: string;
  readonly day: number;
  readonly free: number;
  readonly maybe: number;
}

export interface HeatMonth {
  /** `YYYY-MM`. */
  readonly key: string;
  readonly year: number;
  readonly month: number;
  /** Blank cells before day 1 in a Monday-first week. */
  readonly leadingBlanks: number;
  readonly days: readonly HeatDay[];
}

const KINDS: readonly WindowOptionKind[] = ['best', 'partial', 'full_crew', 'ask_first'];
const ASK_STATES: readonly AskState[] = ['asked', 'freed', 'not_movable', 'timed_out'];

export function toOption(row: OptionRow): WindowOption {
  return {
    id: row.id,
    kind: KINDS.includes(row.kind as WindowOptionKind) ? (row.kind as WindowOptionKind) : 'partial',
    start: row.start_date,
    end: row.end_date,
    freeCount: row.free_count,
    memberCount: row.member_count,
    missingIds: parseIdList(row.missing_member_ids),
    missedMustDoIds: parseIdList(row.missed_must_do_ids),
    askUserId: row.ask_user_id,
    askState: ASK_STATES.includes(row.ask_status as AskState) ? (row.ask_status as AskState) : null,
    priceDeltaMinor: row.price_delta_minor,
    currency: row.currency,
    reason: row.reason,
    isPick: row.is_pick === 1,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Monday-first offset of the 1st of the month (0 = Monday). */
function mondayOffset(year: number, month: number): number {
  return (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
}

/** Every `YYYY-MM` from `from`'s month through `to`'s. */
function monthKeys(from: string, to: string): string[] {
  const keys: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const last = to.slice(0, 7);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key > last) return keys;
    keys.push(key);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

/**
 * Every month that has a counted date, each filled day by day (missing dates count 0 free); with a
 * `span`, every month of it too, so a week can be picked before anyone has shared a day.
 */
export function heatMonths(
  rows: readonly SummaryRow[],
  span?: { readonly from: string; readonly to: string },
): HeatMonth[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const keys = [
    ...new Set([
      ...rows.map((row) => row.date.slice(0, 7)),
      ...(span === undefined ? [] : monthKeys(span.from, span.to)),
    ]),
  ].sort();
  return keys.map((key) => {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    const days = Array.from({ length: daysInMonth(year, month) }, (_, index) => {
      const day = index + 1;
      const date = `${key}-${String(day).padStart(2, '0')}`;
      const row = byDate.get(date);
      return { date, day, free: row?.free_count ?? 0, maybe: row?.maybe_count ?? 0 };
    });
    return { key, year, month, leadingBlanks: mondayOffset(year, month), days };
  });
}

/** How many people have told setup anything (the most known states on any one date). */
export function syncedCount(rows: readonly SummaryRow[]): number {
  return rows.reduce((most, row) => Math.max(most, row.member_count - row.unknown_count), 0);
}

export function crewSize(rows: readonly SummaryRow[], fallback: number): number {
  return rows[0]?.member_count ?? fallback;
}

/** Fill opacity steps of the heatmap (design: .10/.20/.34/.50/.70/1.0 of orange). */
export const HEAT_STEPS = [0.1, 0.2, 0.34, 0.5, 0.7, 1] as const;

export function heatStep(free: number, total: number): number {
  if (total <= 0) return HEAT_STEPS[0];
  const index = Math.round(Math.min(1, Math.max(0, free / total)) * (HEAT_STEPS.length - 1));
  return HEAT_STEPS[index] ?? HEAT_STEPS[0];
}

export type WhenMode =
  /** The dates are decided: the locked range, read-only but for the organiser's change. */
  | 'locked'
  /** A window the whole crew can make: lock it (3c-3). */
  | 'best'
  /** Nothing fits everyone: up to three ways out (3c-4). */
  | 'no_fit'
  /** Counts exist but no option yet (the server is still working them out). */
  | 'computing'
  /** Nobody has shared a single day yet. */
  | 'empty'
  /** Days are in, but the only week everyone can make starts too soon to suggest: pick by hand. */
  | 'pick';

/** The window worth suggesting: the server's best, unless it starts before `earliest`. */
export function suggestedBest(
  options: readonly WindowOption[],
  earliest: string | null,
): WindowOption | null {
  const best = options.find((option) => option.kind === 'best') ?? null;
  return best !== null && earliest !== null && best.start < earliest ? null : best;
}

export function whenMode(
  options: readonly WindowOption[],
  synced: number,
  earliest: string | null = null,
  locked = false,
): WhenMode {
  if (locked) return 'locked';
  if (options.some((option) => option.kind === 'best')) {
    return suggestedBest(options, earliest) === null ? 'pick' : 'best';
  }
  if (options.length > 0) return 'no_fit';
  return synced === 0 ? 'empty' : 'computing';
}

/** The month to open on: the best (or locked) window's, else the first month with anyone free. */
export function initialMonth(
  months: readonly HeatMonth[],
  best: { readonly start: string } | null,
): number {
  if (best !== null) {
    const index = months.findIndex((month) => month.key === best.start.slice(0, 7));
    if (index >= 0) return index;
  }
  const busy = months.findIndex((month) => month.days.some((day) => day.free > 0));
  return Math.max(0, busy);
}

/** The inclusive window as dates, for highlighting cells. */
export function inWindow(date: string, window: { start: string; end: string } | null): boolean {
  return window !== null && date >= window.start && date <= window.end;
}

/** Local date `YYYY-MM-DD` as a UTC-noon Date, for formatting without zone drift. */
export function dateValue(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}
