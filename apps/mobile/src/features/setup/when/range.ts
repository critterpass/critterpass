/**
 * Picking trip days on the dates heatmap, as pure rules the picker sheet and the tests share:
 * a first tap sets an anchor and a ghost suggestion, a second tap (or a drag) closes the range,
 * a tap inside a range moves its nearer end, and the domain's trip length bounds what can be
 * locked. The best windows and the ghost come from the per-date free counts only.
 */
import { TRIP_LENGTH_MAX_DAYS, TRIP_LENGTH_MIN_DAYS } from '@cp/domain';

import { dateValue, type HeatDay, type HeatMonth } from './model';

const DAY_MS = 86_400_000;

export interface DayRange {
  readonly start: string;
  readonly end: string;
}

/** The picker's state: a first day waiting for its last, or a closed range, or neither. */
export interface RangePick {
  readonly anchor: string | null;
  readonly range: DayRange | null;
}

export const EMPTY_PICK: RangePick = { anchor: null, range: null };

export function addDays(date: string, days: number): string {
  return new Date(dateValue(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateValue(to).getTime() - dateValue(from).getTime()) / DAY_MS);
}

export function rangeLength(range: DayRange): number {
  return daysBetween(range.start, range.end) + 1;
}

export function ordered(a: string, b: string): DayRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/**
 * One tap on `date`. The first tap anchors; the second closes the range (the anchor again takes
 * the ghost suggestion, or a single day); a tap inside a range moves its nearer end (the last day
 * on a tie); a tap outside starts over from that day.
 */
export function tapDay(pick: RangePick, date: string, ghost: DayRange | null): RangePick {
  const range = pick.range;
  if (range === null) {
    if (pick.anchor === null) return { anchor: date, range: null };
    if (date === pick.anchor) return { anchor: null, range: ghost ?? { start: date, end: date } };
    return { anchor: null, range: ordered(pick.anchor, date) };
  }
  if (date < range.start || date > range.end) return { anchor: date, range: null };
  if (date === range.start || date === range.end) return pick;
  const toStart = daysBetween(range.start, date);
  const toEnd = daysBetween(date, range.end);
  return {
    anchor: null,
    range: toStart < toEnd ? { start: date, end: range.end } : { start: range.start, end: date },
  };
}

/** What a drag that starts on `date` holds: an end of the range, or a new range. */
export type DragGrip = 'start' | 'end' | 'new';

export function dragGrip(pick: RangePick, date: string): DragGrip {
  if (pick.range?.start === date) return 'start';
  if (pick.range?.end === date) return 'end';
  return 'new';
}

/** The pick while a drag that began on `origin` (holding `grip`) is over `current`. */
export function dragTo(
  pick: RangePick,
  origin: string,
  grip: DragGrip,
  current: string,
): RangePick {
  const range = pick.range;
  if (grip === 'start' && range !== null)
    return { anchor: null, range: ordered(current, range.end) };
  if (grip === 'end' && range !== null)
    return { anchor: null, range: ordered(range.start, current) };
  return { anchor: null, range: ordered(origin, current) };
}

/** Why a range can't be locked, or null when it can. */
export type RangeProblem = 'too_long' | 'too_short';

export function rangeProblem(range: DayRange): RangeProblem | null {
  const length = rangeLength(range);
  if (length > TRIP_LENGTH_MAX_DAYS) return 'too_long';
  if (length < TRIP_LENGTH_MIN_DAYS) return 'too_short';
  return null;
}

export function clampLength(days: number): number {
  return Math.min(TRIP_LENGTH_MAX_DAYS, Math.max(TRIP_LENGTH_MIN_DAYS, Math.round(days)));
}

/** Free counts by date over every month shown. */
export function freeByDate(months: readonly HeatMonth[]): ReadonlyMap<string, number> {
  return new Map(
    months.flatMap((month) => month.days.map((day: HeatDay) => [day.date, day.free] as const)),
  );
}

/** How many can make every day of the range (the fewest free on any one day; unknown days 0). */
export function freeAllDays(free: ReadonlyMap<string, number>, range: DayRange): number {
  let fewest = Number.POSITIVE_INFINITY;
  for (let date = range.start; date <= range.end; date = addDays(date, 1)) {
    fewest = Math.min(fewest, free.get(date) ?? 0);
  }
  return Number.isFinite(fewest) ? fewest : 0;
}

/**
 * The suggested range after a first tap: the trip's planned length from that day, one day shorter
 * when the last day would drop someone the rest of it keeps; never past the last day shown.
 */
export function ghostRange(
  free: ReadonlyMap<string, number>,
  anchor: string,
  lengthDays: number,
  lastDate: string | null,
): DayRange {
  const length = clampLength(lengthDays);
  let end = addDays(anchor, length - 1);
  if (lastDate !== null && end > lastDate) end = lastDate < anchor ? anchor : lastDate;
  if (length > TRIP_LENGTH_MIN_DAYS && end > anchor) {
    const shorter = addDays(end, -1);
    if (
      freeAllDays(free, { start: anchor, end: shorter }) > freeAllDays(free, { start: anchor, end })
    )
      end = shorter;
  }
  return { start: anchor, end };
}

export interface BestWindow {
  readonly range: DayRange;
  /** How many can make every day of it. */
  readonly free: number;
}

/**
 * Up to `limit` windows of the planned length that most of the crew can make, starting no
 * earlier than `from`: the most free first (the earlier on a tie), never overlapping, never one
 * nobody can make.
 */
export function bestWindows(
  free: ReadonlyMap<string, number>,
  lengthDays: number,
  from: string,
  limit = 3,
): BestWindow[] {
  const length = clampLength(lengthDays);
  const dates = [...free.keys()].filter((date) => date >= from).sort();
  const candidates: BestWindow[] = [];
  for (const start of dates) {
    const range = { start, end: addDays(start, length - 1) };
    if (!free.has(range.end)) continue;
    const count = freeAllDays(free, range);
    if (count > 0) candidates.push({ range, free: count });
  }
  candidates.sort((a, b) => b.free - a.free || a.range.start.localeCompare(b.range.start));
  const picked: BestWindow[] = [];
  for (const candidate of candidates) {
    if (picked.length >= limit) break;
    const overlaps = picked.some(
      (other) =>
        candidate.range.start <= other.range.end && other.range.start <= candidate.range.end,
    );
    if (!overlaps) picked.push(candidate);
  }
  return picked;
}

/** The days a pick draws: the closed range, else the ghost after a first tap. */
export function shownRange(pick: RangePick, ghost: DayRange | null): DayRange | null {
  return pick.range ?? (pick.anchor === null ? null : ghost);
}
