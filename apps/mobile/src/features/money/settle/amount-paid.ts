/**
 * The "Amount paid" field of a payment. It holds the digits the expense keypad would have typed:
 * the amount in the currency's own units with its decimals run together ("18640" is US$186.40,
 * "1250000" is 1,250,000 ₫), so each digit typed lands on the right and the amount moves up. The
 * field shows those digits as money; what is sent stays exact minor units, with no float on the way.
 */
import { MAX_AMOUNT_CHARS, minorToUnits, unitsToMinor } from '../add-expense/draft';
import { formatAmount } from '../format';

/** The digits of the full amount, which the field starts with. */
export function amountPaidDigits(amountMinor: bigint, currency: string): string {
  return minorToUnits(amountMinor, currency);
}

/** The money the digits read as ("US$186.40", "1.250.000 ₫"); empty while nothing is typed. */
export function amountPaidText(digits: string, currency: string, locale: string): string {
  return digits === '' ? '' : formatAmount(unitsToMinor(digits, currency), currency, locale);
}

/**
 * The digits after the person edits the shown text. Deleting the symbol or a group mark takes the
 * last digit, as deleting a digit does, and an amount longer than the field takes is not typed.
 */
export function amountPaidAfterEdit(
  digits: string,
  shown: string,
  edited: string,
  maxDigits: number = MAX_AMOUNT_CHARS,
): string {
  const typed = edited.replace(/\D/gu, '').replace(/^0+/u, '');
  if (typed === digits && edited.length < shown.length) return digits.slice(0, -1);
  return typed.length > Math.max(maxDigits, MAX_AMOUNT_CHARS) ? digits : typed;
}

/**
 * Minor units for the digits in the field. While it reads the full amount that is the amount
 * owed to the last minor unit, including a part the currency does not show (IDR's sen).
 */
export function amountPaidMinor(digits: string, amountMinor: bigint, currency: string): bigint {
  if (digits === amountPaidDigits(amountMinor, currency)) return amountMinor;
  return unitsToMinor(digits, currency);
}

/** All of it, or a part: more than nothing and no more than what is owed. */
export function isAmountPaidValid(paidMinor: bigint, amountMinor: bigint): boolean {
  return paidMinor > 0n && paidMinor <= amountMinor;
}
