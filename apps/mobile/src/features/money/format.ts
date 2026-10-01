/**
 * Money display helpers for the money screens. Stored amounts are exact integers in ISO minor
 * units; these only turn them into text (a display-only conversion to a JS number, never fed back
 * into arithmetic). Full amounts go through the app-wide formatter so symbols match everywhere.
 */
import {
  compactNumber,
  currencyExponent,
  currencySymbol,
  displayDecimals,
  formatMoney,
  isKnownCurrency,
} from '@cp/cost-engine';
import { format } from '@cp/i18n';

const MINUS = '−';

function known(currency: string): boolean {
  return isKnownCurrency(currency);
}

/** Major units as a display number (e.g. 18640 USD minor → 186.4). */
export function toMajor(amountMinor: bigint, currency: string): number {
  const exponent = known(currency) ? currencyExponent(currency) : 2;
  return Number(amountMinor) / 10 ** exponent;
}

/** "US$186.40", "Rp 450.000". */
export function formatAmount(amountMinor: bigint, currency: string, locale: string): string {
  if (!known(currency)) return `${currency} ${String(toMajor(amountMinor, currency))}`;
  return formatMoney({ amountMinor, currency }, { locale, mode: 'local' });
}

/** Amount without symbol: "186.40", "450.000". */
export function formatPlain(amountMinor: bigint, currency: string, locale: string): string {
  const decimals = known(currency) ? displayDecimals(currency) : 2;
  const abs = amountMinor < 0n ? -amountMinor : amountMinor;
  return format.number(locale, toMajor(abs, currency), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Balance column: "+186.40", "−41.00", "0.00". */
export function formatSigned(amountMinor: bigint, currency: string, locale: string): string {
  const body = formatPlain(amountMinor, currency, locale);
  if (amountMinor > 0n) return `+${body}`;
  if (amountMinor < 0n) return `${MINUS}${body}`;
  return body;
}

export function symbolOf(currency: string): string {
  return known(currency) ? currencySymbol(currency) : currency;
}

/** Short amount for chips, rows and buttons: "Rp 1.08M", "Rp 450K", "US$68". */
export function formatShort(amountMinor: bigint, currency: string, locale: string): string {
  const major = toMajor(amountMinor < 0n ? -amountMinor : amountMinor, currency);
  const body =
    major >= 10_000
      ? compactNumber(locale, major)
      : format.number(locale, major, { maximumFractionDigits: major >= 100 ? 0 : 2 });
  const symbol = symbolOf(currency);
  const sign = amountMinor < 0n ? MINUS : '';
  if (symbolTrails(currency, locale)) return `${sign}${body}\u00a0${symbol}`;
  const spaced = /[A-Za-z]$/u.test(symbol) ? `${symbol} ` : symbol;
  return `${sign}${spaced}${body}`;
}

/**
 * True where the locale writes this currency's symbol after the number ("1.250.000 ₫" in
 * Vietnamese), so the keypad's amount, the short form and the rows all place it the same way.
 */
export function symbolTrails(currency: string, locale: string): boolean {
  return formatAmount(0n, currency, locale).search(/\d/u) === 0;
}

/** Whole major units and the text around them, for the rolling hero number. */
export function heroParts(
  amountMinor: bigint,
  currency: string,
  locale: string,
): { readonly whole: number; readonly prefix: string; readonly suffix: string } {
  const text = formatAmount(amountMinor < 0n ? -amountMinor : amountMinor, currency, locale);
  const first = text.search(/\d/u);
  const decimals = known(currency) ? displayDecimals(currency) : 2;
  const exponent = known(currency) ? currencyExponent(currency) : 2;
  const abs = amountMinor < 0n ? -amountMinor : amountMinor;
  const whole = Number(abs / 10n ** BigInt(exponent));
  const last = text.search(/\d\D*$/u);
  const suffixStart = decimals === 0 ? last + 1 : last - decimals;
  return {
    whole,
    prefix: first > 0 ? text.slice(0, first) : '',
    suffix: last < 0 ? '' : text.slice(suffixStart),
  };
}

/**
 * The type size a hero amount fits its row at, by how many characters it prints (symbol,
 * digits and group marks): "$4,812" at the full hero size, "₫10,600,000" a step down, and
 * anything longer at the heading size, so the amount is never cut off at the screen edge.
 */
export function heroVariant(parts: {
  readonly whole: number;
  readonly prefix: string;
  readonly suffix: string;
}): 'displayHero' | 'displayXl' | 'h1' {
  const digits = String(Math.abs(Math.trunc(parts.whole))).length;
  const length = parts.prefix.length + parts.suffix.length + digits + Math.floor((digits - 1) / 3);
  if (length <= 8) return 'displayHero';
  return length <= 11 ? 'displayXl' : 'h1';
}

/** A calendar date (`YYYY-MM-DD`) at noon UTC, so formatting it in UTC never shifts the day. */
export function calendarDate(localDate: string): Date {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time suffix, never copy.
  return new Date(`${localDate}T12:00:00Z`);
}

/** Whole units for headline totals: "US$4,812", "Rp 1.080.000". */
export function formatWhole(amountMinor: bigint, currency: string, locale: string): string {
  if (!known(currency)) return formatAmount(amountMinor, currency, locale);
  return format.number(locale, Math.round(toMajor(amountMinor, currency)), {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
