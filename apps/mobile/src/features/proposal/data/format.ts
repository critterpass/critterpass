/**
 * How the proposal screens write amounts and dates: a whole amount in the trip's currency
 * ("$1,310"), a signed saving ("−$64"), a calendar date ("Sep 30") and a date range ("Apr 2–9").
 * Calendar dates are read at UTC noon so they never drift across zones.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */

import { formatNarrowCurrency } from '@cp/cost-engine';

/** The currency's minor-unit digits (2 for USD, 0 for VND). */
function minorDigitsOf(currency: string): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/** A minor-unit amount as whole currency units ("$1,310"). */
export function wholeMoney(locale: string, minor: number, currency: string): string {
  return formatNarrowCurrency(locale, Math.round(minor / 10 ** minorDigitsOf(currency)), currency, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

/** A signed change as whole units: "−$64", "+$24". */
export function signedMoney(locale: string, minor: number, currency: string): string {
  const sign = minor < 0 ? '−' : '+';
  return `${sign}${wholeMoney(locale, Math.abs(minor), currency)}`;
}

const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };

function utcNoon(date: string): Date {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`);
}

/** "Sep 30" for a calendar date ("2026-09-30"). */
export function shortDate(locale: string, date: string): string {
  return new Intl.DateTimeFormat(locale, DAY).format(utcNoon(date));
}

/** "Sep 30" for an instant, in the device's zone. */
export function instantDate(locale: string, instant: string): string {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(at);
}

/** "Sep 30, 21:00" for an instant, in the device's zone. */
export function instantDateTime(locale: string, instant: string): string {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

export function dayRange(locale: string, start: string, end: string): string {
  const format = new Intl.DateTimeFormat(locale, DAY);
  const from = utcNoon(start);
  const to = utcNoon(end);
  if (start.slice(0, 10) === end.slice(0, 10)) return format.format(from);
  if (start.slice(0, 7) === end.slice(0, 7) && typeof format.formatToParts === 'function') {
    return format
      .formatToParts(from)
      .map((part) => (part.type === 'day' ? `${part.value}–${to.getUTCDate()}` : part.value))
      .join('');
  }
  return `${format.format(from)} – ${format.format(to)}`;
}

/** The first word of a display name ("Rin" for "Rin Sato"). */
export function firstName(displayName: string | null): string {
  return displayName?.trim().split(/\s+/u)[0] ?? '';
}

/** "17:00": an instant on the clock of its own zone, 24-hour as the plan writes times. */
export function clock(locale: string, instant: string, tz: string | null): string {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: tz ?? 'UTC',
    }).format(at);
  } catch {
    return at.toISOString().slice(11, 16);
  }
}
