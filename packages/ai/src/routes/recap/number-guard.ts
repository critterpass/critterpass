/**
 * The recap's number guard and tone rules. Every number in the guide's copy must be one the facts
 * hold (a time, an amount, a count, a distance); a number word ("twelve", "twice") counts as its
 * number, so a count cannot slip past spelled out, and "hundreds" or "thousands" are refused. Award
 * lines and the got-away line also keep to the tone rules: nothing about bodies, health, drinking,
 * money owed or lateness.
 */
import type { RecapCopyAward, RecapCopyFacts } from './schema';

const NUMBER = /\d+(?:[.,:]\d+)*/gu;

/** Number words and the number each stands for; "one" stays free ("the one that got away"). */
// prettier-ignore
const WORD_VALUES: Readonly<Record<string, number>> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80,
  ninety: 90, twice: 2, thrice: 3, dozen: 12, both: 2,
};
const NUMBER_WORD = new RegExp(`\\b(${Object.keys(WORD_VALUES).join('|')})\\b`, 'giu');
/** Round numbers the facts never hold. */
const VAGUE = /\b(hundreds?|thousands?|millions?|dozens)\b/iu;

/** Words an award or a got-away line may never use (tone rules for naming crewmates). */
const TONE =
  /\b(fat|weight|body|belly|ugly|drunk\w*|hungover|hangover|booze|boozy|beer|beers|wine|vodka|tequila|sick|ill|illness|vomit\w*|puk\w*|injur\w*|limp\w*|knee|knees|cheap|cheapskate|stingy|broke|debt|owes?|owed|owing|late|lateness|tardy|lazy)\b/iu;

function numbersIn(text: string): string[] {
  return [...text.matchAll(NUMBER)].map((match) => match[0]);
}

function collect(value: unknown, into: string[]): void {
  if (typeof value === 'number') into.push(String(value));
  else if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) for (const item of value) collect(item, into);
  else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collect(item, into);
  }
}

/** Every number the copy may carry: each one in the facts, whole and by part. */
export function allowedRecapNumbers(
  facts: RecapCopyFacts,
  awards: readonly RecapCopyAward[],
): ReadonlySet<string> {
  const sources: string[] = [];
  collect(facts, sources);
  collect(
    awards.map((award) => ({ value: award.value, evidence: award.evidence })),
    sources,
  );
  // "1" is the digit of "one", which is always free ("1 island", "the one that got away").
  const allowed = new Set<string>(['1']);
  // A number word the facts themselves carry ("The Six", a crew name) may be repeated.
  for (const source of sources) {
    for (const match of source.matchAll(NUMBER_WORD)) allowed.add(`word:${match[0].toLowerCase()}`);
  }
  for (const token of sources.flatMap(numbersIn)) {
    allowed.add(token);
    allowed.add(token.replace(/,/gu, ''));
    for (const part of token.split(/[.,:]/u)) {
      allowed.add(part);
      allowed.add(String(Number(part)));
    }
  }
  return allowed;
}

/** The numbers in `text` the facts do not vouch for, number words included. */
export function ungroundedRecapNumbers(text: string, allowed: ReadonlySet<string>): string[] {
  const loose = numbersIn(text).filter(
    (token) =>
      !allowed.has(token) &&
      !allowed.has(token.replace(/,/gu, '')) &&
      !allowed.has(String(Number(token))),
  );
  for (const match of text.matchAll(NUMBER_WORD)) {
    const word = match[0].toLowerCase();
    if (!allowed.has(String(WORD_VALUES[word])) && !allowed.has(`word:${word}`))
      loose.push(match[0]);
  }
  const vague = VAGUE.exec(text);
  return vague === null ? loose : [...loose, vague[0]];
}

/** The first tone-rule word in `text`, or null. */
export function toneSlip(text: string): string | null {
  return TONE.exec(text)?.[0] ?? null;
}
