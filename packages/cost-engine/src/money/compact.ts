/**
 * Compact notation for approximate amounts, e.g. an itinerary estimate ("~$1.2k") or a per-person
 * quote before an exact split exists. Compacting is inherently lossy, so the "~" marker is always
 * present — unlike `format.ts`'s "≈", which marks a currency *conversion* rather than a magnitude
 * approximation.
 */
import { compactFromMinor } from './intl-fallbacks';
import { currencyExponent, currencySymbol } from './currencies';
import { type Money } from './money';

export interface FormatCompactMoneyOptions {
  readonly locale: string;
}

/** Exact `amountMinor` -> a decimal string of *major* units (the stored ISO exponent), no float. */
function toMajorUnitDecimalString(amountMinor: bigint, exponent: number): string {
  if (exponent === 0) {
    return amountMinor.toString();
  }
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  const divisor = 10n ** BigInt(exponent);
  const whole = abs / divisor;
  const fraction = (abs % divisor).toString().padStart(exponent, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

/**
 * Renders `amount` in compact notation ("~$1.2k", "~Rp 75 jt"), delegating the magnitude suffix and
 * rounding-to-significant-digits to `Intl.NumberFormat`'s own `notation: 'compact'` (locale-correct
 * by construction) and only substituting Critterpass's disambiguated currency symbol.
 */
export function formatCompactMoney(amount: Money, options: FormatCompactMoneyOptions): string {
  const exponent = currencyExponent(amount.currency);
  const decimalString = toMajorUnitDecimalString(amount.amountMinor, exponent);
  const symbol = currencySymbol(amount.currency);
  const body = formatCompactBody(decimalString, amount, exponent, options.locale, symbol);
  return `~${body}`;
}

function formatCompactBody(
  decimalString: string,
  amount: Money,
  exponent: number,
  locale: string,
  symbol: string,
): string {
  const { currency, amountMinor } = amount;
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      compactDisplay: 'short',
    });
    if (typeof formatter.formatToParts === 'function') {
      return formatter
        .formatToParts(asNumericLiteral(decimalString))
        .map((part) => (part.type === 'currency' ? symbol : part.value))
        .join('');
    }
    // No `formatToParts` (Hermes on iPhone, which has no compact notation either): the symbol in
    // front of the scaled number, standing off from it when it ends in a letter ("Rp 75M").
    const body = compactFromMinor(locale, amountMinor, exponent);
    return /[A-Za-z]$/u.test(symbol) ? `${symbol}\u00a0${body}` : `${symbol}${body}`;
  } catch {
    return `${symbol}${decimalString}`;
  }
}

/**
 * `toMajorUnitDecimalString` only ever emits an optional "-", digits, and optionally "." + digits,
 * so it always matches `Intl.StringNumericLiteral`'s `${number}` pattern; TypeScript's `NumberFormat`
 * types just cannot verify that for a dynamically-built string, so this narrows it once.
 */
function asNumericLiteral(value: string): Intl.StringNumericLiteral {
  return value as Intl.StringNumericLiteral;
}
