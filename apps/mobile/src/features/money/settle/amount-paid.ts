/**
 * The "Amount paid" field of a payment (`AmountField`): it starts with the full amount and a part
 * can be typed over it. What is sent stays exact minor units, with no float on the way.
 */
import { digitsToMinor, minorToDigits } from '@/data/money/amount-digits';

/** The digits of the full amount, which the field starts with. */
export function amountPaidDigits(amountMinor: bigint, currency: string): string {
  return minorToDigits(amountMinor, currency);
}

/**
 * Minor units for the digits in the field. While it reads the full amount that is the amount
 * owed to the last minor unit, including a part the currency does not show (IDR's sen).
 */
export function amountPaidMinor(digits: string, amountMinor: bigint, currency: string): bigint {
  if (digits === amountPaidDigits(amountMinor, currency)) return amountMinor;
  return digitsToMinor(digits, currency);
}

/** All of it, or a part: more than nothing and no more than what is owed. */
export function isAmountPaidValid(paidMinor: bigint, amountMinor: bigint): boolean {
  return paidMinor > 0n && paidMinor <= amountMinor;
}
