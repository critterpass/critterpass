/**
 * How the drafting screens write dates, times and amounts: a local-date range ("Apr 2–9"), a
 * short weekday ("Fri"), a clock time in the stop's own zone ("11:20") and a whole amount in the
 * trip's currency ("$1,310"). Calendar dates are read at UTC noon so they never drift across
 * zones. Hermes has no `Intl.DateTimeFormat#formatRange`, so a range inside one month puts both
 * days into the start date's own locale pattern.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };

import { formatNarrowCurrency, isKnownCurrency, roundEstimate } from '@cp/cost-engine';
import { clockOption } from '@/lib/i18n/formats';

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
      ...clockOption(),
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

/** A minor-unit estimate rounded the way every estimate is shown (unchanged for an unknown code). */
export function estimateMinor(minor: number, currency: string): number {
  if (!isKnownCurrency(currency) || !Number.isFinite(minor)) return minor;
  return Number(roundEstimate({ amountMinor: BigInt(Math.round(minor)), currency }).amountMinor);
}

/**
 * An estimate as it is shown: three significant digits, never finer than the currency's cash step
 * ("₫3,340,000", "₫467,000"; "$202" stays "$202"). The draft's cost each, its stays' nightly
 * rates and a redraft's cost change are all estimates; a booked or spent amount is never put
 * through this.
 */
export function estimateMoney(locale: string, minor: number, currency: string): string {
  return wholeMoney(locale, estimateMinor(minor, currency), currency);
}

/**
 * How far over the budget the draft reads, from the figure on screen: the locked target is exact,
 * the cost each is shown rounded, so the gap is the rounded cost less the target. Zero or less
 * means the rounded cost no longer reads as over.
 */
export function overBudgetMinor(
  costPpMinor: number,
  overByMinor: number,
  currency: string,
): number {
  if (overByMinor <= 0) return 0;
  const target = costPpMinor - overByMinor;
  return Math.max(0, estimateMinor(costPpMinor, currency) - target);
}
