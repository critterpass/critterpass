/**
 * The tip line's number grounding (numbers come from code, never from the model). Every
 * number and month in a phrased tip must come from the stored facts: an amount in major units, a
 * day, a year, a percentage or an index a detector computed. A line with anything else is
 * rejected and the deterministic template is shown instead.
 */
import type { TipKind } from '@cp/domain';

export const TIP_LINE_MAX = 120;

export interface TipFact {
  readonly kind: TipKind;
  readonly place_id: string;
  /** The place's display name. */
  readonly place: string;
  readonly value_minor: number | null;
  readonly currency: string | null;
  /** `YYYY-MM-DD`: the fare month, the book-by deadline, the event start or the quiet month. */
  readonly date: string | null;
  /** Origin airport (IATA) and its city, for fares. */
  readonly origin: string | null;
  readonly origin_city?: string | null | undefined;
  /** Whole-percent fare drop. */
  readonly delta_pct?: number | null | undefined;
  /** Season event name (blossoms, a festival). */
  readonly event?: string | null | undefined;
  /** Crowd index 1–5 of the quiet month. */
  readonly crowd_index?: number | null | undefined;
}

/** ISO 4217 currencies without minor units (the cost engine's exponent table). */
const ZERO_EXPONENT = new Set(['JPY', 'VND', 'IDR', 'KRW', 'CLP', 'ISK', 'TWD', 'HUF']);

export function majorUnits(valueMinor: number, currency: string): number {
  return ZERO_EXPONENT.has(currency.toUpperCase()) ? valueMinor : valueMinor / 100;
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

const MONTH_WORD =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/giu;
const NUMBER = /\d[\d,]*(?:\.\d+)?/gu;

function normalise(raw: string): string {
  const plain = raw.replace(/,/gu, '').replace(/\.0+$/u, '');
  const trimmed = plain.replace(/^0+(?=\d)/u, '');
  return trimmed.includes('.') ? trimmed.replace(/0+$/u, '') : trimmed;
}

/** Every number a line may carry, normalised (no separators, no trailing zeros). */
export function allowedNumbers(facts: readonly TipFact[]): ReadonlySet<string> {
  const allowed = new Set<string>();
  const add = (value: number) => allowed.add(normalise(String(value)));
  for (const fact of facts) {
    if (fact.value_minor !== null && fact.currency !== null) {
      const major = majorUnits(fact.value_minor, fact.currency);
      add(major);
      add(Math.round(major));
      add(Number(major.toFixed(2)));
    }
    if (fact.date !== null) {
      const [year, , day] = fact.date.split('-');
      if (year !== undefined) add(Number(year));
      if (day !== undefined) add(Number(day));
    }
    if (fact.delta_pct != null) add(fact.delta_pct);
    if (fact.crowd_index != null) add(fact.crowd_index);
  }
  return allowed;
}

function allowedMonths(facts: readonly TipFact[]): ReadonlySet<number> {
  const months = new Set<number>();
  for (const fact of facts) {
    if (fact.date !== null) months.add(Number(fact.date.slice(5, 7)) - 1);
  }
  return months;
}

function monthIndex(word: string): number {
  const lower = word.toLowerCase();
  return MONTHS.findIndex((month) => month.startsWith(lower.slice(0, 3)));
}

/** The numbers and months in `line` that no fact supports (empty = grounded). */
export function ungroundedTokens(line: string, facts: readonly TipFact[]): string[] {
  const numbers = allowedNumbers(facts);
  const months = allowedMonths(facts);
  const bad: string[] = [];
  for (const match of line.matchAll(NUMBER)) {
    if (!numbers.has(normalise(match[0]))) bad.push(match[0]);
  }
  for (const match of line.matchAll(MONTH_WORD)) {
    // "may" is also a verb; only a capitalised May reads as the month.
    if (match[0] === 'may') continue;
    if (!months.has(monthIndex(match[0]))) bad.push(match[0]);
  }
  return bad;
}

/** The line when it is one grounded line within the length cap, else null. */
export function validateTipLine(text: string, facts: readonly TipFact[]): string | null {
  const line = text
    .trim()
    .replace(/^["“'](.*)["”']$/u, '$1')
    .trim();
  if (line.length === 0 || line.length > TIP_LINE_MAX || line.includes('\n')) return null;
  return ungroundedTokens(line, facts).length === 0 ? line : null;
}
