/**
 * A dish's price, read by code from the menu's own text: the amount printed on the dish's line,
 * or on a price-only line in the same row of the frame. The model never supplies a number. The
 * currency comes from the mark printed with the amount, else the trip's currency.
 */
import { parsePrintedAmount } from '../receipt-parse/amounts';

export interface MenuLine {
  readonly id: string;
  readonly text: string;
  /** Left, top, width and height as fractions of the frame. */
  readonly bbox: readonly [number, number, number, number];
}

export interface MenuPrice {
  /** The amount as the menu prints it ("45.000", "45k", "$4.50"). */
  readonly printed: string;
  /** In the currency's minor units; null when the currency is not known. */
  readonly amount_minor: number | null;
  readonly currency: string | null;
  readonly source_line_id: string;
}

const MARKS: readonly (readonly [RegExp, string | null])[] = [
  [/₫|đ|vnd/iu, 'VND'],
  [/rp|idr/iu, 'IDR'],
  [/฿|thb|บาท/iu, 'THB'],
  [/¥|円|jpy/iu, 'JPY'],
  [/₩|krw|원/iu, 'KRW'],
  [/rm|myr/iu, 'MYR'],
  [/s\$|sgd/iu, 'SGD'],
  [/us\$|usd/iu, 'USD'],
  [/€|eur/iu, 'EUR'],
  [/£|gbp/iu, 'GBP'],
  // A bare dollar sign is whatever dollar the trip pays in.
  [/\$/u, null],
];
const ZERO_DECIMAL: ReadonlySet<string> = new Set(['VND', 'IDR', 'JPY', 'KRW']);

const BEFORE = String.raw`(?:rp\.?|rm|us\$|s\$|[$¥€£฿₫₩])`;
const AFTER = String.raw`(?:(?:k|rb|đ|vnd|idr|thb|usd|eur)(?![\p{L}\d])|₫|円|บาท|원|€)`;
const NUMBER = String.raw`\d{1,3}(?:[.,\u00A0 ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const PRICE = new RegExp(`(${BEFORE})?\\s?(${NUMBER})\\s?(${AFTER})?`, 'giu');

interface Found {
  readonly printed: string;
  readonly number: string;
  readonly marks: string;
  readonly thousands: boolean;
  readonly atEnd: boolean;
}

function lastPrice(text: string): Found | null {
  let found: Found | null = null;
  for (const match of text.matchAll(PRICE)) {
    const [whole, before = '', number = '', after = ''] = match;
    const end = (match.index ?? 0) + whole.length;
    found = {
      printed: whole.trim(),
      number,
      marks: `${before} ${after}`,
      thousands: /^(?:k|rb)$/iu.test(after),
      atEnd: text.slice(end).trim() === '',
    };
  }
  if (found === null) return null;
  const marked = found.marks.trim() !== '';
  // An unmarked number is a price only where a menu prints one: closing the line, two digits up.
  const plain = found.atEnd && found.number.replace(/\D/gu, '').length >= 2;
  return marked || plain ? found : null;
}

function currencyOf(found: Found, hint: string | undefined): string | null {
  for (const [mark, currency] of MARKS) {
    if (mark.test(found.marks)) return currency ?? hint ?? null;
  }
  return hint ?? null;
}

function toPrice(found: Found, lineId: string, hint: string | undefined): MenuPrice {
  const currency = currencyOf(found, hint);
  let amount: number | null = null;
  if (currency !== null) {
    const exponent = ZERO_DECIMAL.has(currency) ? 0 : 2;
    const minor = parsePrintedAmount(found.number.replace(/[\u00A0 ]/gu, ''), exponent);
    if (minor !== null) {
      const scaled = found.thousands ? minor * 1000n : minor;
      amount = scaled <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(scaled) : null;
    }
  }
  return { printed: found.printed, amount_minor: amount, currency, source_line_id: lineId };
}

/** Whether `other` sits in the same printed row as `line`, to its right. */
function sameRow(line: MenuLine, other: MenuLine): boolean {
  const [, top, , height] = line.bbox;
  const [left, otherTop, , otherHeight] = other.bbox;
  const centre = top + height / 2;
  const otherCentre = otherTop + otherHeight / 2;
  return Math.abs(centre - otherCentre) <= Math.max(height, otherHeight) / 2 && left > line.bbox[0];
}

export function parseMenuPrice(
  lines: readonly MenuLine[],
  itemLineId: string,
  currencyHint?: string,
): MenuPrice | null {
  const line = lines.find((candidate) => candidate.id === itemLineId);
  if (line === undefined) return null;
  const own = lastPrice(line.text);
  if (own !== null) return toPrice(own, line.id, currencyHint);
  const beside = lines
    .filter((other) => other.id !== line.id && sameRow(line, other))
    .sort((a, b) => a.bbox[0] - b.bbox[0]);
  for (const other of beside) {
    const found = lastPrice(other.text);
    // A price column entry is the amount alone, not another dish that happens to end in a number.
    if (found !== null && found.printed.length >= other.text.trim().length - 1) {
      return toPrice(found, other.id, currencyHint);
    }
  }
  return null;
}
