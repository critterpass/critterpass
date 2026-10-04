/**
 * A place's hours over the days a search looks at (the trip's days the asker did not leave out):
 * whether it is open past a time, open for a meal, and when it closes. Unknown hours answer null,
 * never "closed", so a place with no hours is not called shut.
 */
import { openSpans, type Hours, type OpenSpan } from '@cp/domain';

import type { SearchMeal } from './filters';

/** Spans per looked-at date; null when the place's hours are unknown. */
export type DaySpans =
  readonly { readonly date: string; readonly spans: readonly OpenSpan[] }[] | null;

export function daySpans(hours: Hours | null, dates: readonly string[]): DaySpans {
  if (hours === null) return null;
  return dates.map((date) => ({ date, spans: openSpans(hours, date) }));
}

const toMinutes = (time: string): number => {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return hour * 60 + minute;
};

const toClock = (minutes: number): string => {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(wrapped / 60);
  return `${String(hour).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

/** Times before 05:00 mean the small hours after that evening. */
const eveningMinutes = (time: string): number => {
  const minutes = toMinutes(time);
  return minutes < 300 ? minutes + 1440 : minutes;
};

/** Open past `time` (still open after it) on at least one looked-at day. */
export function openPast(days: DaySpans, time: string): boolean | null {
  if (days === null) return null;
  const at = eveningMinutes(time);
  return days.some(({ spans }) => spans.some((span) => span.start <= at && span.end > at));
}

/** Local minutes a meal is eaten in, for "open for dinner". */
export const MEAL_WINDOWS: Readonly<Record<SearchMeal, readonly [number, number]>> = {
  breakfast: [7 * 60, 10 * 60],
  lunch: [11 * 60 + 30, 14 * 60 + 30],
  dinner: [18 * 60, 21 * 60],
  coffee: [8 * 60, 17 * 60],
  drinks: [17 * 60, 23 * 60],
};

/** Open for at least an hour of the meal's window on at least one looked-at day. */
export function openForMeal(days: DaySpans, meal: SearchMeal): boolean | null {
  if (days === null) return null;
  const [from, to] = MEAL_WINDOWS[meal];
  const need = Math.min(60, to - from);
  return days.some(({ spans }) =>
    spans.some((span) => Math.min(span.end, to) - Math.max(span.start, from) >= need),
  );
}

/** The evening's last closing on `date`, ignoring the previous night's carry-over. */
function closingOn(spans: readonly OpenSpan[]): number | null {
  const own = spans.filter((span) => span.start > 0 || spans.length === 1);
  if (own.length === 0) return null;
  return Math.max(...own.map((span) => span.end));
}

/**
 * When the place closes: on `preferDate` when given and open that day, else on the looked-at day
 * it stays open latest. Null when unknown or closed on every day.
 */
export function closesAt(days: DaySpans, preferDate?: string | null): string | null {
  if (days === null) return null;
  const preferred = days.find((day) => day.date === preferDate);
  const preferredClose = preferred === undefined ? null : closingOn(preferred.spans);
  if (preferredClose !== null) return toClock(preferredClose);
  const closes = days.flatMap(({ spans }) => {
    const close = closingOn(spans);
    return close === null ? [] : [close];
  });
  return closes.length === 0 ? null : toClock(Math.max(...closes));
}
