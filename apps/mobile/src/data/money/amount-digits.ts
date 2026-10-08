/**
 * The digits behind an amount typed on a number pad, shared by the expense keypad and the
 * `AmountField` (`@/ui/inputs/AmountField`, which shows `amountText` and reports the digits after
 * each edit). An amount is held as the digits of its smallest shown unit run together, so each
 * digit typed lands on the right and the amount moves up, as on a till:
 *
 * - `display` (the default): the units the currency shows. "18640" is US$186.40, "1250000" is
 *   1,250,000 ₫, "12500" is KD 12.500, and "450000" is Rp 450.000 (rupiah shows no sen).
 * - `whole`: whole major units, for a figure that never needs cents ("7440" is US$7,440).
 *
 * Decimals come from the engine's currency table, the conversion to and from ISO minor units is
 * exact integer arithmetic, and the text shown is the engine's own money format.
 */
import { currencyExponent, displayDecimals, formatMoney, isKnownCurrency } from '@cp/cost-engine';

export type AmountUnit = 'display' | 'whole';

/** A plain boolean: the engine's type guard would narrow an unknown code away. */
function known(currency: string): boolean {
  return isKnownCurrency(currency);
}

/** Decimal places the unit shows for the currency. */
function shownDecimals(currency: string, unit: AmountUnit): number {
  return unit === 'whole' || !known(currency) ? 0 : displayDecimals(currency);
}

/** ISO minor units in one unit of the digits (rupiah stores sen it never shows). */
function unitScale(currency: string, unit: AmountUnit): bigint {
  if (!known(currency)) return 1n;
  return 10n ** BigInt(currencyExponent(currency) - shownDecimals(currency, unit));
}

/** The digits as exact ISO minor units; nothing typed is zero. */
export function digitsToMinor(
  digits: string,
  currency: string,
  unit: AmountUnit = 'display',
): bigint {
  return BigInt(digits === '' ? '0' : digits) * unitScale(currency, unit);
}

/** The digits that type `amountMinor`, dropping any part the unit does not show; empty for zero. */
export function minorToDigits(
  amountMinor: bigint,
  currency: string,
  unit: AmountUnit = 'display',
): string {
  if (amountMinor <= 0n) return '';
  const units = amountMinor / unitScale(currency, unit);
  return units === 0n ? '' : units.toString();
}

/**
 * The digits written as money in the currency ("US$186.40", "1.250.000 ₫", "US$7,440" for whole
 * units), with the symbol where the locale puts it; empty while nothing is typed.
 */
export function amountText(
  digits: string,
  currency: string,
  locale: string,
  unit: AmountUnit = 'display',
): string {
  if (digits === '') return '';
  if (!known(currency)) return `${currency} ${digits}`;
  const text = formatMoney(
    { amountMinor: digitsToMinor(digits, currency, unit), currency },
    { locale, mode: 'local' },
  );
  const decimals = displayDecimals(currency);
  if (unit !== 'whole' || decimals === 0) return text;
  // Whole units: take the decimal mark and the zeros after it out of the engine's text.
  const last = text.search(/\d\D*$/u);
  return last < decimals ? text : text.slice(0, last - decimals) + text.slice(last + 1);
}
