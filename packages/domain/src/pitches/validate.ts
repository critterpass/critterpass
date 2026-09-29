/**
 * Pitch grounding: every number and month in a model-written section must come from the pitch's
 * tool facts (prices in major units, flight hours, headcounts, event dates, deltas), written as
 * given. A section with anything else is dropped (and asked for once more); code-built chips and
 * alternatives never pass through the model at all.
 */
import { PITCH_HEADLINE_MAX, PITCH_QUOTE_MAX, PITCH_REASON_MAX, type PitchFacts } from './schema';

/** ISO 4217 currencies without minor units (the cost engine's exponent table). */
const ZERO_EXPONENT = new Set(['JPY', 'VND', 'IDR', 'KRW', 'CLP', 'ISK', 'TWD', 'HUF']);

export function pitchMajorUnits(valueMinor: number, currency: string): number {
  return ZERO_EXPONENT.has(currency.toUpperCase()) ? valueMinor : valueMinor / 100;
}

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;
const MONTH_WORD =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/giu;
const NUMBER = /\d[\d,]*(?:\.\d+)?/gu;

function normalise(raw: string): string {
  const plain = raw.replace(/,/gu, '').replace(/\.0+$/u, '');
  const trimmed = plain.replace(/^0+(?=\d)/u, '');
  return trimmed.includes('.') ? trimmed.replace(/0+$/u, '') : trimmed;
}

/** Every number a section may carry. */
export function pitchAllowedNumbers(facts: PitchFacts): ReadonlySet<string> {
  const allowed = new Set<string>();
  const add = (value: number) => allowed.add(normalise(String(value)));
  const money = (minor: number, currency: string) => {
    const major = pitchMajorUnits(minor, currency);
    add(major);
    add(Math.round(major));
  };
  add(facts.crew.size);
  for (const fare of facts.fares) {
    money(fare.price_minor, fare.currency);
    add(fare.members);
    if (fare.transfers !== null) add(fare.transfers);
    if (fare.duration_min !== null) {
      add(Math.round(fare.duration_min / 60));
      add(Math.floor(fare.duration_min / 60));
      add(Math.ceil(fare.duration_min / 60));
    }
  }
  for (const event of facts.season.events) {
    const [year, , day] = event.starts_on.split('-');
    if (year !== undefined) add(Number(year));
    if (day !== undefined) add(Number(day));
  }
  for (const alternative of facts.alternatives) {
    if (alternative.delta_minor !== null && alternative.currency !== null) {
      money(alternative.delta_minor, alternative.currency);
    }
  }
  for (const taste of facts.taste) add(taste.member_ids.length);
  return allowed;
}

function allowedMonths(facts: PitchFacts): ReadonlySet<number> {
  const months = new Set<number>(facts.season.best_months);
  if (facts.month !== null) months.add(facts.month);
  for (const event of facts.season.events) months.add(Number(event.starts_on.slice(5, 7)));
  return months;
}

/** The numbers and months in `text` no fact supports (empty = grounded). */
export function pitchUngroundedTokens(text: string, facts: PitchFacts): string[] {
  const numbers = pitchAllowedNumbers(facts);
  const months = allowedMonths(facts);
  const bad: string[] = [];
  for (const match of text.matchAll(NUMBER)) {
    if (!numbers.has(normalise(match[0]))) bad.push(match[0]);
  }
  for (const match of text.matchAll(MONTH_WORD)) {
    if (match[0] === 'may') continue;
    const index = MONTHS.indexOf(match[0].slice(0, 3).toLowerCase() as (typeof MONTHS)[number]);
    if (!months.has(index + 1)) bad.push(match[0]);
  }
  return bad;
}

export type PitchTextSection = 'headline' | 'reason' | 'quote';

const LIMITS: Readonly<Record<PitchTextSection, number>> = {
  headline: PITCH_HEADLINE_MAX,
  reason: PITCH_REASON_MAX,
  quote: PITCH_QUOTE_MAX,
};

/** The section's text when it is one grounded line within its cap, else null. */
export function validatePitchText(
  section: PitchTextSection,
  raw: string,
  facts: PitchFacts,
): string | null {
  const text = raw
    .trim()
    .replace(/^["“'](.*)["”']$/u, '$1')
    .trim();
  if (text.length === 0 || text.length > LIMITS[section] || text.includes('\n')) return null;
  if (/https?:\/\/|www\./iu.test(text)) return null;
  return pitchUngroundedTokens(text, facts).length === 0 ? text : null;
}
