/**
 * Local wall-clock time → UTC instant for per-object timers (docs/api-contracts-async.md §2.3;
 * daily resets run at local midnight in the device's zone): "20:00 in Asia/Saigon on 3 May" must
 * fire at one exact instant every time, including across daylight-saving changes.
 *
 * - Gap (the wall time never happens, e.g. 02:30 when clocks jump 02:00 → 03:00): fire at the next
 *   valid minute, the instant the clocks jump (03:00 local), never an hour late.
 * - Overlap (the wall time happens twice, e.g. 02:30 when clocks fall back 03:00 → 02:00): fire at
 *   the first occurrence.
 */
import { Temporal } from '@js-temporal/polyfill';

export interface LocalScheduleInput {
  /** ISO calendar date, `YYYY-MM-DD`. */
  readonly date: string;
  /** Wall-clock time, `HH:MM` or `HH:MM:SS`. */
  readonly time: string;
  /** IANA time zone, e.g. `Europe/Berlin`. */
  readonly tz: string;
}

export type LocalScheduleResolution = 'exact' | 'gap' | 'overlap';

export interface LocalScheduleResult {
  readonly at: Date;
  /** How the wall time mapped: exactly once, skipped by a gap, or repeated by an overlap. */
  readonly resolution: LocalScheduleResolution;
}

function wallTime(input: LocalScheduleInput): Temporal.PlainDateTime {
  const date = Temporal.PlainDate.from(input.date, { overflow: 'reject' });
  const time = Temporal.PlainTime.from(input.time, { overflow: 'reject' });
  return date.toPlainDateTime(time);
}

/** Resolves a local wall time in `tz` to the instant it fires, with how it was resolved. */
export function resolveLocalSchedule(input: LocalScheduleInput): LocalScheduleResult {
  const wall = wallTime(input);
  const earlier = wall.toZonedDateTime(input.tz, { disambiguation: 'earlier' });
  const later = wall.toZonedDateTime(input.tz, { disambiguation: 'later' });

  if (Temporal.PlainDateTime.compare(earlier.toPlainDateTime(), wall) !== 0) {
    // In a gap, `earlier` lands before the jump; the next transition is the jump itself.
    const jump = earlier.getTimeZoneTransition('next');
    if (jump === null) throw new Error(`no transition after a gap in ${input.tz}`);
    return { at: new Date(jump.epochMilliseconds), resolution: 'gap' };
  }
  const resolution = earlier.epochMilliseconds === later.epochMilliseconds ? 'exact' : 'overlap';
  return { at: new Date(earlier.epochMilliseconds), resolution };
}

/** The UTC instant a local wall time in `tz` fires at (see the file header for DST rules). */
export function localSchedule(input: LocalScheduleInput): Date {
  return resolveLocalSchedule(input).at;
}

/** The wall-clock date and time of `at` in `tz` (`YYYY-MM-DD`, `HH:MM:SS`). */
export function toLocalWallTime(at: Date, tz: string): { date: string; time: string } {
  const zoned = Temporal.Instant.fromEpochMilliseconds(at.getTime()).toZonedDateTimeISO(tz);
  return {
    date: zoned.toPlainDate().toString(),
    time: zoned.toPlainTime().toString({ smallestUnit: 'second' }),
  };
}
