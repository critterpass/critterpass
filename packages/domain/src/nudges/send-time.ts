/**
 * When a nudge is delivered: at the target's engagement hour, the local hour they opened the app
 * most over the last 14 days (19:00 when there is no history), in their own zone. The next such
 * hour after now, moved to the end of quiet hours when it falls inside them, and to the next day
 * when the target already has their two nudges that day.
 */
import { Temporal } from '@js-temporal/polyfill';

import { localSchedule } from '../time/local-schedule';

export const ENGAGEMENT_WINDOW_DAYS = 14;
export const DEFAULT_ENGAGEMENT_HOUR = 19;

export interface AppOpenHour {
  readonly hourLocal: number;
  readonly opens: number;
  readonly updatedAt: Date;
}

/** The modal open hour of the last 14 days; ties go to the most recently used hour. */
export function engagementHour(hours: readonly AppOpenHour[], now: Date): number {
  const since = now.getTime() - ENGAGEMENT_WINDOW_DAYS * 86_400_000;
  let best: AppOpenHour | null = null;
  for (const hour of hours) {
    if (hour.updatedAt.getTime() < since || hour.opens <= 0) continue;
    if (
      best === null ||
      hour.opens > best.opens ||
      (hour.opens === best.opens && hour.updatedAt.getTime() > best.updatedAt.getTime())
    ) {
      best = hour;
    }
  }
  return best?.hourLocal ?? DEFAULT_ENGAGEMENT_HOUR;
}

export interface QuietHours {
  /** `HH:MM[:SS]` local. */
  readonly from: string;
  readonly to: string;
}

export interface SendTimeInput {
  readonly now: Date;
  readonly tz: string;
  readonly hour: number;
  readonly quiet: QuietHours | null;
  /** Local dates (`YYYY-MM-DD`) on which the target already has the day's cap of nudges. */
  readonly fullDates?: ReadonlySet<string>;
}

export interface SendTime {
  readonly at: Date;
  /** `YYYY-MM-DDTHH:MM` in the target's zone. */
  readonly local: string;
}

function minutesOf(time: string): number {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
}

/** True when local minute-of-day `minute` is inside quiet hours (which may wrap midnight). */
export function inQuietHours(minute: number, quiet: QuietHours): boolean {
  const from = minutesOf(quiet.from);
  const to = minutesOf(quiet.to);
  if (from === to) return false;
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

const pad = (value: number): string => String(value).padStart(2, '0');

export function nudgeSendTime(input: SendTimeInput): SendTime {
  const today = Temporal.Instant.fromEpochMilliseconds(input.now.getTime())
    .toZonedDateTimeISO(input.tz)
    .toPlainDate();
  let minute = input.hour * 60;
  if (input.quiet !== null && inQuietHours(minute, input.quiet)) minute = minutesOf(input.quiet.to);
  const time = `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
  for (let offset = 0; offset < 14; offset += 1) {
    const date = today.add({ days: offset }).toString();
    if (input.fullDates?.has(date) === true) continue;
    const at = localSchedule({ date, time, tz: input.tz });
    if (at.getTime() > input.now.getTime()) return { at, local: `${date}T${time}` };
  }
  const date = today.add({ days: 14 }).toString();
  return { at: localSchedule({ date, time, tz: input.tz }), local: `${date}T${time}` };
}
