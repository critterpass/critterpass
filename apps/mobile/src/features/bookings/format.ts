/**
 * Dates, times and prices as the wallet prints them, always in the booking's own time zone (a
 * 03:30 pickup reads 03:30 wherever the phone is), falling back to the trip's, then the device's.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
import { currencyExponent, formatMoney, isKnownCurrency } from '@cp/cost-engine';
import { format } from '@cp/i18n';
import { clockOption } from '@/lib/i18n/formats';

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
    ...clockOption(),
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

/**
 * "US$228.00", "Rp 450.000": the shared money formatter's symbol and decimals, so a booking's
 * price reads as it does in Money (the runtime's own currency data prints the code on iPhone).
 */
export function price(locale: string, minor: number, currency: string): string {
  const code: string = currency;
  if (!isKnownCurrency(code)) return `${currency} ${format.number(locale, minor / 100)}`;
  return formatMoney(
    { amountMinor: BigInt(Math.round(minor)), currency: code },
    { locale, mode: 'local' },
  );
}

/** Decimal places of a currency's minor unit, from the engine's table (2 for one it lacks). */
export function currencyDigits(currency: string): number {
  return isKnownCurrency(currency) ? currencyExponent(currency) : 2;
}
