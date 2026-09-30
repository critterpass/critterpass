/**
 * Reading amounts as printed: code, never the model, turns the printed digits into minor units, and
 * only from the text of the OCR line the amount is printed on.
 */
import type { OcrLine } from './schema';

/**
 * Parses an amount as printed into minor units: the last `.` or `,` followed by one or two digits
 * is the decimal point; any other separator (or one followed by three digits) groups thousands.
 * In a currency printed with cents, a space before the last two digits is the decimal point.
 * Returns `null` for anything that is not a plain amount.
 */
export function parsePrintedAmount(printed: string, exponent: number): bigint | null {
  const trimmed = printed.trim();
  const negative = /^[-−(]/u.test(trimmed);
  // A currency mark and a sign may surround the number; anything else (an OCR "?", a letter in
  // the digits) means the amount was not read cleanly.
  const bare = trimmed
    .replace(/^[-−(]\s*/u, '')
    .replace(/\)$/u, '')
    .replace(/^(?:rp|rm|us\$|s\$|[$¥€£฿₫₩]|vnd|idr|thb|jpy|sgd|myr)\s*/iu, '')
    .replace(/\s*(?:đ|₫|vnd|円|บาท)$/iu, '')
    // Thousands grouped with spaces ("55 000", "1 250 000"), as Vietnamese tills print them.
    .replace(/^\d{1,3}(?:[ \u00A0\u202F]\d{3})+(?=(?:[.,]\d{1,2})?$)/u, (grouped) =>
      grouped.replace(/[ \u00A0\u202F]/gu, ''),
    );
  // A decimal point the recogniser read as a space ("24 22"), in a currency printed with cents.
  const spaced = exponent === 2 ? /^(\d{1,3}) (\d{2})$/u.exec(bare) : null;
  if (spaced !== null) return parsePrintedAmount(`${spaced[1]}.${spaced[2]}`, exponent);
  if (!/^\d[\d.,]*$/u.test(bare)) return null;
  const decimal = /[.,](\d{1,2})$/u.exec(bare);
  // Thousands come in groups of three (or the lakh grouping, "1,00,000"); "20,00.00" or
  // "1.05.000" means the recogniser lost a digit, so the amount is not taken.
  const grouped = decimal === null ? bare : bare.slice(0, decimal.index);
  if (!/^(?:\d+(?:[.,]\d{3})*|\d{1,2}(?:,\d{2})+,\d{3})$/u.test(grouped)) {
    return null;
  }
  const whole = (decimal === null ? bare : bare.slice(0, decimal.index)).replace(/[.,]/gu, '');
  if (whole.length > 13) return null;
  const fraction = (decimal?.[1] ?? '').padEnd(exponent, '0');
  if (fraction.length > exponent && /[1-9]/u.test(fraction.slice(exponent))) return null;
  const kept = fraction.slice(0, exponent);
  const minor =
    BigInt(whole === '' ? '0' : whole) * 10n ** BigInt(exponent) + BigInt(kept === '' ? '0' : kept);
  return negative ? -minor : minor;
}

export const squash = (text: string) => text.replace(/\s+/gu, '');

/** The amount as printed on `line`, or `null` when the line does not carry it. */
export function amountOnLine(line: OcrLine | undefined, printed: string, exponent: number) {
  if (line === undefined || printed.trim() === '') return null;
  if (!squash(line.text).includes(squash(printed))) return null;
  return parsePrintedAmount(printed, exponent);
}

/** An amount printed on `line` with a space inside its digits ("3 5,000"), read closed up. */
export function spacedAmount(line: OcrLine | undefined, printed: string, exponent: number) {
  const closed = printed.replace(/(\d)[ \u00A0]+(?=\d)/gu, '$1');
  if (line === undefined || closed === printed || !squash(line.text).includes(squash(printed))) {
    return null;
  }
  const amount = parsePrintedAmount(closed, exponent);
  return amount === null || amount <= 0n ? null : Number(amount);
}

/** A line that prints nothing but one amount (a currency mark or a trailing `x` aside). */
export const isPriceOnly = (text: string) =>
  /^[-−(]?\s*(?:rp|rm|us\$|s\$|[$¥€£฿₫₩]|vnd|idr|thb|jpy|sgd|myr)?\s*\d[\d.,\s]*\s*(?:đ|₫|vnd|円|บาท|x)?\)?$/iu.test(
    text.trim(),
  );
