/**
 * What a translated line must keep before it is stored: something to read, within the surface's
 * length, exactly the numbers of the line it translates (times, prices, counts and dates, digit
 * for digit, none added and none dropped) and nothing explained in brackets that the line itself
 * does not explain. A line that fails is left out, so its readers keep the source text; one bad
 * line never spoils the rest of the batch.
 */
import type { TranslateLine, TranslateReply } from './schema';

const NUMBER = /\d+(?:[.,:/-]\d+)*/gu;

/** The number-like tokens of a line (`7:30`, `150,000`, `2`), sorted. */
export function numberTokens(text: string): string[] {
  return (text.match(NUMBER) ?? []).sort();
}

/** An aside in brackets (a gloss, a note): only a line that has one may come back with one. */
const BRACKET = /[([{（［]/u;

export type TranslateRejection =
  'missing' | 'empty' | 'too_long' | 'numbers_changed' | 'added_aside' | 'duplicate' | 'unknown_id';

export interface TranslateVerdict {
  /** Line id → the translation to store. */
  readonly accepted: ReadonlyMap<string, string>;
  readonly rejected: readonly { readonly id: string; readonly reason: TranslateRejection }[];
}

function check(line: TranslateLine, text: string): TranslateRejection | null {
  if (text === '') return 'empty';
  if (text.length > line.max) return 'too_long';
  const source = numberTokens(line.text);
  const translated = numberTokens(text);
  if (source.length !== translated.length || source.some((token, i) => token !== translated[i])) {
    return 'numbers_changed';
  }
  if (BRACKET.test(text) && !BRACKET.test(line.text)) return 'added_aside';
  return null;
}

export function validateTranslateReply(
  reply: TranslateReply,
  lines: readonly TranslateLine[],
): TranslateVerdict {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const accepted = new Map<string, string>();
  const rejected: { id: string; reason: TranslateRejection }[] = [];
  const seen = new Set<string>();
  for (const item of reply.items) {
    const line = byId.get(item.id);
    if (line === undefined) {
      rejected.push({ id: item.id, reason: 'unknown_id' });
      continue;
    }
    if (seen.has(item.id)) {
      accepted.delete(item.id);
      rejected.push({ id: item.id, reason: 'duplicate' });
      continue;
    }
    seen.add(item.id);
    const text = item.text.replace(/\s+/gu, ' ').trim();
    const reason = check(line, text);
    if (reason === null) accepted.set(item.id, text);
    else rejected.push({ id: item.id, reason });
  }
  for (const line of lines) {
    if (!seen.has(line.id)) rejected.push({ id: line.id, reason: 'missing' });
  }
  return { accepted, rejected };
}
