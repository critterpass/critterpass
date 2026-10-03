/**
 * A place's opening spans on one local calendar date, in minutes of that date's wall clock: the
 * one implementation fit, slot finding and crowd windows share. A span that runs past midnight
 * ends after minute 1440; the tail of the previous evening's overnight span (a bar open until
 * 02:00) opens the date at minute 0. A date exception replaces the weekly spans for that date.
 *
 * Minutes are wall-clock minutes, so no zone is needed: the caller already holds the local date
 * in the place's zone (docs/code-standards.md §2: local days through Temporal, never `Date`).
 */
import { Temporal } from '@js-temporal/polyfill';

import { WEEKDAYS, type Hours, type TimeSpan, type Weekday } from './hours';

export interface OpenSpan {
  /** Local minute the place opens, 0..1439. */
  readonly start: number;
  /** Local minute it closes; past 1440 when it closes after midnight. */
  readonly end: number;
}

function toMinutes(time: string): number {
  if (time === '24:00') return 1440;
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function resolve(spans: readonly TimeSpan[]): OpenSpan[] {
  return spans.map((span) => {
    const start = toMinutes(span.start);
    const end = toMinutes(span.end);
    return { start, end: end <= start ? end + 1440 : end };
  });
}

function spansOfDate(hours: Hours, date: Temporal.PlainDate): OpenSpan[] {
  const exception = hours.exceptions?.find((entry) => entry.date === date.toString());
  if (exception) return resolve(exception.spans);
  const weekday = WEEKDAYS[date.dayOfWeek - 1] as Weekday;
  return resolve(hours.weekly[weekday] ?? []);
}

/** Opening spans on `date` (`YYYY-MM-DD`), sorted, the previous night's carry-over first. */
export function openSpans(hours: Hours, date: string): readonly OpenSpan[] {
  const day = Temporal.PlainDate.from(date);
  const carry = spansOfDate(hours, day.subtract({ days: 1 }))
    .filter((span) => span.end > 1440)
    .map((span) => ({ start: 0, end: span.end - 1440 }));
  return [...carry, ...spansOfDate(hours, day)].sort((a, b) => a.start - b.start);
}

/** Whether the place is open for the whole of `[start, end)` on `date` (local minutes). */
export function openThrough(
  spans: readonly OpenSpan[],
  start: number,
  end: number,
): OpenSpan | null {
  return spans.find((span) => span.start <= start && span.end >= end) ?? null;
}
