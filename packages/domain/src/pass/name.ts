/**
 * Given-name rules for the pass (3a-2): trimmed, at most 24 characters (graphemes), any script.
 * Blocked words come from content, so the check takes the list rather than owning one.
 */
export const GIVEN_NAME_MAX = 24;

export type GivenNameProblem = 'empty' | 'too_long' | 'blocked';

function graphemes(text: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter === undefined) return Array.from(text);
  return Array.from(
    new Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
    (s) => s.segment,
  );
}

export function givenNameLength(name: string): number {
  return graphemes(name.trim()).length;
}

/** Collapses inner whitespace and trims; the stored and displayed form. */
export function normalizeGivenName(name: string): string {
  return name.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

/** Clips typing at the limit so the field never holds more than the pass can show. */
export function clipGivenName(name: string): string {
  const parts = graphemes(name);
  return parts.length <= GIVEN_NAME_MAX ? name : parts.slice(0, GIVEN_NAME_MAX).join('');
}

function foldForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function givenNameProblem(
  name: string,
  blockedWords: readonly string[],
): GivenNameProblem | null {
  const normalized = normalizeGivenName(name);
  if (normalized.length === 0) return 'empty';
  if (givenNameLength(normalized) > GIVEN_NAME_MAX) return 'too_long';
  const folded = foldForMatch(normalized);
  const tokens = normalized.split(' ').map(foldForMatch);
  const blocked = blockedWords.some((word) => {
    const w = foldForMatch(word);
    return w.length > 0 && (tokens.includes(w) || (w.length >= 5 && folded.includes(w)));
  });
  return blocked ? 'blocked' : null;
}
