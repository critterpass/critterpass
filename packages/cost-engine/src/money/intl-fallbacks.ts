/**
 * The one place that works around what Hermes's `Intl.NumberFormat` lacks on iPhone:
 * `formatToParts` (Android only), `notation: 'compact'` (ignored: the number is written out in
 * full) and `currencyDisplay: 'narrowSymbol'` (the ISO code is written instead). Node has all three,
 * so unit tests never see the gap; the tests here take them away on purpose.
 *
 * Each helper asks the runtime first, so a locale's own grouping, digits and symbol placement are
 * kept, and only repairs what came back wrong.
 */
import { currencySymbol, isKnownCurrency } from './currencies';

/** Characters a formatted number is made of besides its currency: digits, separators, signs. */
const NUMBER_CHARS = /[\d\s.,'’\u066c\u066b\u00a0\u202f\u2212+()-]/u;

/** The currency text in a formatted amount ("IDR" in "IDR 150,000", "₫" in "1.250.000 ₫"). */
function currencyTextIn(text: string): string | null {
  let token = '';
  for (const char of text) {
    if (!NUMBER_CHARS.test(char)) token += char;
    else if (token !== '') break;
  }
  return token === '' ? null : token;
}

/**
 * `text` with the runtime's currency text swapped for `symbol`. A symbol that ends in a letter
 * ("Rp") stands off from the digits; one that doesn't ("$") hugs them.
 */
export function withCurrencySymbol(text: string, symbol: string): string {
  const found = currencyTextIn(text);
  if (found === null) return `${symbol}${text}`;
  if (found === symbol) return text;
  const wordy = /[A-Za-z]$/u.test(symbol);
  const index = text.indexOf(found);
  const before = text.slice(0, index);
  let after = text.slice(index + found.length);
  if (wordy && /^\d/u.test(after)) after = `\u00a0${after}`;
  if (!wordy) after = after.replace(/^[\s\u00a0\u202f](?=\d)/u, '');
  return `${before}${symbol}${after}`;
}

/**
 * A currency amount in the locale's own grouping and placement, with `symbol` as its currency
 * text. `value` is a decimal string so large minor-unit amounts keep their digits.
 */
export function formatCurrencyText(
  locale: string,
  value: string,
  currency: string,
  symbol: string,
  decimals: number,
): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const numeric = value as Intl.StringNumericLiteral;
  if (typeof formatter.formatToParts === 'function') {
    return formatter
      .formatToParts(numeric)
      .map((part) => (part.type === 'currency' ? symbol : part.value))
      .join('');
  }
  return withCurrencySymbol(formatter.format(numeric), symbol);
}

/** The currency's own short symbol ("$", "₫", "Rp") from the bundled table; else its code. */
export function narrowCurrencySymbol(currency: string): string {
  return isKnownCurrency(currency) ? currencySymbol(currency, 'narrow') : currency;
}

/**
 * "$1,350", "1.350.000 ₫": a number of major units in the currency's short symbol, formatted by
 * the locale. Where the runtime writes the ISO code for a narrow symbol, the code is swapped.
 */
export function formatNarrowCurrency(
  locale: string,
  value: number,
  currency: string,
  options: {
    readonly maximumFractionDigits?: number;
    readonly minimumFractionDigits?: number;
  } = {},
): string {
  const base = { style: 'currency', currency, ...options } as const;
  let text: string;
  try {
    text = new Intl.NumberFormat(locale, { ...base, currencyDisplay: 'narrowSymbol' }).format(
      value,
    );
  } catch {
    text = new Intl.NumberFormat(locale, base).format(value);
  }
  const symbol = narrowCurrencySymbol(currency);
  return symbol === currency || !text.includes(currency) ? text : withCurrencySymbol(text, symbol);
}

const COMPACT_STEPS: readonly (readonly [size: number, suffix: string])[] = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

function threeDigits(locale: string, value: number | Intl.StringNumericLiteral): string {
  return new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 }).format(value);
}

/**
 * "450K", "1.08M": the locale's own compact form where the runtime has one; where it writes the
 * number out in full instead, the value is scaled here with the locale's digits and decimal mark.
 */
export function compactNumber(locale: string, value: number): string {
  const full = threeDigits(locale, value);
  let native = full;
  try {
    native = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumSignificantDigits: 3,
    }).format(value);
  } catch {
    // A runtime that rejects the option outright: scaled below.
  }
  if (native !== full) return native;
  const magnitude = Math.abs(value);
  const step = COMPACT_STEPS.find(([size]) => magnitude >= size);
  return step === undefined ? full : `${threeDigits(locale, value / step[0])}${step[1]}`;
}

/**
 * The same scaling for an exact amount: whole major units from minor units, scaled in integers
 * (never through a float) and written with the locale's digits ("75M" for 75,000,000).
 */
export function compactFromMinor(locale: string, amountMinor: bigint, exponent: number): string {
  const sign = amountMinor < 0n ? '-' : '';
  const major = (amountMinor < 0n ? -amountMinor : amountMinor) / 10n ** BigInt(exponent);
  const step = COMPACT_STEPS.find(([size]) => major >= BigInt(size));
  if (step === undefined)
    return threeDigits(locale, `${sign}${major}` as Intl.StringNumericLiteral);
  const thousandths = (major * 1000n) / BigInt(step[0]);
  const scaled = `${sign}${thousandths / 1000n}.${String(thousandths % 1000n).padStart(3, '0')}`;
  return `${threeDigits(locale, scaled as Intl.StringNumericLiteral)}${step[1]}`;
}
