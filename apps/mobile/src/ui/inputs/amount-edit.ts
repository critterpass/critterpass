/**
 * Editing an amount shown as money in a text field (`AmountField`). The field holds the amount as
 * digits run together ("18640" is US$186.40) and shows them formatted; these rules turn an edit of
 * that text back into digits.
 */

/** An amount field takes at most this many digits unless its caller's amount is longer. */
export const AMOUNT_MAX_DIGITS = 10;

/**
 * The digits after the person edits the shown text. Only digits count; deleting the symbol or a
 * group mark takes the last digit, as deleting a digit does, and an amount longer than the field
 * takes is not typed.
 */
export function digitsAfterEdit(
  digits: string,
  shown: string,
  edited: string,
  maxDigits: number = AMOUNT_MAX_DIGITS,
): string {
  const typed = edited.replace(/\D/gu, '').replace(/^0+/u, '');
  if (typed === digits && edited.length < shown.length) return digits.slice(0, -1);
  return typed.length > Math.max(maxDigits, AMOUNT_MAX_DIGITS) ? digits : typed;
}
