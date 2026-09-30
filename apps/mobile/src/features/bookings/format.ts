/**
 * Dates, times and prices as the wallet prints them, always in the booking's own time zone (a
 * 03:30 pickup reads 03:30 wherever the phone is), falling back to the trip's, then the device's.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
import { format } from '@cp/i18n';

export function zoneOf(...zones: readonly (string | null | undefined)[]): string | undefined {
  return zones.find((zone): zone is string => typeof zone === 'string' && zone !== '');
}

function valid(iso: string | null | undefined): Date | null {
  if (iso === null || iso === undefined) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** "09:05". */
export function clock(locale: string, iso: string | null | undefined, tz?: string): string {
  const at = valid(iso);
  if (at === null) return '';
  return format.date(locale, at, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(tz === undefined ? {} : { timeZone: tz }),
  });
}

/** "Mon 12 Oct". */
export function dayDate(locale: string, iso: string | null | undefined, tz?: string): string {
  const at = valid(iso);
  if (at === null) return '';
  return format.date(locale, at, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(tz === undefined ? {} : { timeZone: tz }),
  });
}

/** "Oct 15". */
export function shortDate(locale: string, iso: string | null | undefined, tz?: string): string {
  const at = valid(iso);
  if (at === null) return '';
  return format.date(locale, at, {
    day: 'numeric',
    month: 'short',
    ...(tz === undefined ? {} : { timeZone: tz }),
  });
}

/** "12 Oct 2026, 18:00". */
export function dateTime(locale: string, iso: string | null | undefined, tz?: string): string {
  const at = valid(iso);
  if (at === null) return '';
  return format.date(locale, at, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(tz === undefined ? {} : { timeZone: tz }),
  });
}

/** "$228", "Rp 450,000": whole units unless the amount has cents. */
export function price(locale: string, minor: number, currency: string): string {
  const digits = currencyDigits(currency);
  const units = minor / 10 ** digits;
  return format.number(locale, units, {
    style: 'currency',
    currency,
    maximumFractionDigits: Number.isInteger(units) ? 0 : digits,
    minimumFractionDigits: Number.isInteger(units) ? 0 : digits,
  });
}

export function currencyDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}
