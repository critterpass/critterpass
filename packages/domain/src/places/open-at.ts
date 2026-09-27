/**
 * tz-correct opening-hours evaluation (docs/code-standards.md §2 "Dates": local-day logic via the
 * `Temporal` polyfill, never `Date` arithmetic). Every function here takes
 * the destination's (or a POI's override) IANA zone and a UTC instant, and decomposes it with
 * `Temporal` internally — the exported functions still speak plain `Date` at the boundary since
 * nothing else in this codebase is Temporal-typed yet.
 */
import { Temporal } from '@js-temporal/polyfill';

import { WEEKDAYS, type Hours, type TimeSpan, type Weekday } from './hours';

interface ResolvedSpan {
  readonly startMin: number;
  /** May exceed 1440: an overnight span's end is represented as its wall-clock end + 1440. */
  readonly endMin: number;
}

function timeToMinutes(time: string): number {
  if (time === '24:00') return 1440;
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  return hour * 60 + minute;
}

function resolveSpans(spans: readonly TimeSpan[]): readonly ResolvedSpan[] {
  return spans.map((span) => {
    const startMin = timeToMinutes(span.start);
    const rawEndMin = timeToMinutes(span.end);
    return { startMin, endMin: rawEndMin <= startMin ? rawEndMin + 1440 : rawEndMin };
  });
}

function toZonedDateTime(tz: string, instant: Date): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(instant.getTime()).toZonedDateTimeISO(tz);
}

function weekdayOf(date: Temporal.PlainDate): Weekday {
  // Temporal's dayOfWeek is ISO (1 = Monday .. 7 = Sunday), matching WEEKDAYS' index 0 = Monday.
  return WEEKDAYS[date.dayOfWeek - 1] as Weekday;
}

function spansForDate(hours: Hours, date: Temporal.PlainDate): readonly ResolvedSpan[] {
  const exception = hours.exceptions?.find((candidate) => candidate.date === date.toString());
  if (exception) return resolveSpans(exception.spans);
  return resolveSpans(hours.weekly[weekdayOf(date)] ?? []);
}

/**
 * Minutes remaining until the place closes, if it is open at `instant`; `undefined` if closed.
 * Shared by `openAt`/`closesSoon` so both agree on exactly the same notion of "currently open",
 * including the case where the active span is an overnight one that started the previous day.
 */
function minutesUntilClose(hours: Hours, tz: string, instant: Date): number | undefined {
  const zdt = toZonedDateTime(tz, instant);
  const minutesNow = zdt.hour * 60 + zdt.minute;
  const today = zdt.toPlainDate();

  const activeToday = spansForDate(hours, today).find(
    (span) => minutesNow >= span.startMin && minutesNow < span.endMin,
  );
  if (activeToday) return activeToday.endMin - minutesNow;

  const yesterday = today.subtract({ days: 1 });
  const carryOver = spansForDate(hours, yesterday).find(
    (span) => span.endMin > 1440 && minutesNow < span.endMin - 1440,
  );
  if (carryOver) return carryOver.endMin - 1440 - minutesNow;

  return undefined;
}

/** Whether the place is open at `instant`, evaluated in `tz` (overnight spans and exceptions included). */
export function openAt(hours: Hours, tz: string, instant: Date): boolean {
  return minutesUntilClose(hours, tz, instant) !== undefined;
}

/** True if open now and closing within `withinMinutes` (powers "closes soon" badges in the UI). */
export function closesSoon(
  hours: Hours,
  tz: string,
  instant: Date,
  withinMinutes: number,
): boolean {
  const remaining = minutesUntilClose(hours, tz, instant);
  return remaining !== undefined && remaining <= withinMinutes;
}

const NEXT_OPEN_HORIZON_DAYS = 14;

/**
 * The next instant the place opens at/after `instant` (itself, if already open), evaluated in `tz`.
 * `null` if nothing opens within `NEXT_OPEN_HORIZON_DAYS` (e.g. every day is `off` — a data problem,
 * not a crash). DST is handled by `Temporal.PlainDate#toZonedDateTime`'s disambiguation default: a
 * wall-clock start time that does not exist on a spring-forward day resolves to the nearest valid one.
 */
export function nextOpen(hours: Hours, tz: string, instant: Date): Date | null {
  if (openAt(hours, tz, instant)) return instant;

  const startZdt = toZonedDateTime(tz, instant);
  const nowMinutes = startZdt.hour * 60 + startZdt.minute;

  for (let dayOffset = 0; dayOffset <= NEXT_OPEN_HORIZON_DAYS; dayOffset += 1) {
    const date = startZdt.toPlainDate().add({ days: dayOffset });
    const startMinutes = spansForDate(hours, date)
      .map((span) => span.startMin)
      .filter((startMin) => dayOffset > 0 || startMin > nowMinutes)
      .sort((a, b) => a - b);
    const nextStart = startMinutes[0];
    if (nextStart !== undefined) {
      const zdt = date.toZonedDateTime({
        timeZone: tz,
        plainTime: Temporal.PlainTime.from({
          hour: Math.floor(nextStart / 60),
          minute: nextStart % 60,
        }),
      });
      return new Date(zdt.epochMilliseconds);
    }
  }
  return null;
}
