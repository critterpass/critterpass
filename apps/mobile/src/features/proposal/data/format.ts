/**
 * How the proposal screens write amounts and dates: a whole amount in the trip's currency
 * ("$1,310"), a signed saving ("−$64"), a calendar date ("Sep 30") and a date range ("Apr 2–9").
 * Calendar dates are read at UTC noon so they never drift across zones.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */

function currencyFormat(locale: string, currency: string, digits?: number): Intl.NumberFormat {
  const base = {
    style: 'currency',
    currency,
    ...(digits === undefined ? {} : { maximumFractionDigits: digits, minimumFractionDigits: 0 }),
  } as const;
  try {
    return new Intl.NumberFormat(locale, { ...base, currencyDisplay: 'narrowSymbol' });
  } catch {
    return new Intl.NumberFormat(locale, base);
  }
}

function minorDigits(locale: string, currency: string): number {
  return currencyFormat(locale, currency).resolvedOptions().maximumFractionDigits ?? 2;
}

/** A minor-unit amount as whole currency units ("$1,310"). */
export function wholeMoney(locale: string, minor: number, currency: string): string {
  const digits = minorDigits(locale, currency);
  return currencyFormat(locale, currency, 0).format(Math.round(minor / 10 ** digits));
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
