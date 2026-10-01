/**
 * How the drafting screens write dates, times and amounts: a local-date range ("Apr 2–9"), a
 * short weekday ("Fri"), a clock time in the stop's own zone ("11:20") and a whole amount in the
 * trip's currency ("$1,310"). Calendar dates are read at UTC noon so they never drift across
 * zones. Hermes has no `Intl.DateTimeFormat#formatRange`, so a range inside one month puts both
 * days into the start date's own locale pattern.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };

import { formatNarrowCurrency } from '@cp/cost-engine';

function utcNoon(date: string): Date {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`);
}

export function dayRange(locale: string, start: string, end: string): string {
  const format = new Intl.DateTimeFormat(locale, DAY);
  const from = utcNoon(start);
  const to = utcNoon(end);
  const ranged = format as Intl.DateTimeFormat & { formatRange?: (a: Date, b: Date) => string };
  if (typeof ranged.formatRange === 'function') return ranged.formatRange(from, to);
  if (start.slice(0, 10) === end.slice(0, 10)) return format.format(from);
  if (start.slice(0, 7) === end.slice(0, 7) && typeof format.formatToParts === 'function') {
    return format
      .formatToParts(from)
      .map((part) => (part.type === 'day' ? `${part.value}–${to.getUTCDate()}` : part.value))
      .join('');
  }
  return `${format.format(from)} – ${format.format(to)}`;
}

export function shortDate(locale: string, date: string): string {
  return new Intl.DateTimeFormat(locale, DAY).format(utcNoon(date));
}

export function weekday(locale: string, date: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
    utcNoon(date),
  );
}

/** "11:20": a stop's start in its own zone, 24-hour as the plan screens write times. */
export function clock(locale: string, instant: string, tz: string): string {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: tz,
    }).format(at);
  } catch {
    return at.toISOString().slice(11, 16);
  }
}

/** The currency's minor-unit digits (2 for USD, 0 for VND). */
function minorDigitsOf(currency: string): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/** A minor-unit amount as whole currency units ("$1,310"), the way estimates are shown. */
export function wholeMoney(locale: string, minor: number, currency: string): string {
  return formatNarrowCurrency(locale, Math.round(minor / 10 ** minorDigitsOf(currency)), currency, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}
