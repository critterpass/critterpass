/**
 * Time and day formatting for the timeline, in the viewer's locale and zone. Intl option values
 * below are API keys, never copy.
 */
import { clockOption } from '@/lib/i18n/formats';
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */

const DAY_MS = 86_400_000;

export function timeOf(iso: string, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    ...clockOption(),
    minute: '2-digit',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(new Date(iso));
}

/** Whole days from `day` to `today` (both `YYYY-MM-DD`). */
export function daysBetween(day: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS);
}

export function weekdayOf(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

export function shortDateOf(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}
