/**
 * Place names as people and editors write them, made comparable: accents and case dropped
 * ("Ngũ Hành Sơn" = "ngu hanh son"), plurals folded ("Mountains" = "mountain"), and a name split
 * into the names it carries. "Ngũ Hành Sơn (Marble Mountain)" is one place with two names; in
 * "Cà Phê Trứng 3T - Cầu Rồng - Đà Nẵng" only the first part names the place, the rest says where
 * it is. A must-do typed by hand ("Marble Mountains at sunrise") is matched by finding a place's
 * name inside the text, never by comparing the whole text.
 */
import type { DraftPoi } from './types';

/** Lowercase tokens without accents or punctuation; a plural "s" on a longer word is dropped. */
export function nameTokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)
    .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token));
}

export interface NameAliases {
  /** What the place is called: the leading part of its name and any name in brackets beside it. */
  readonly primary: readonly (readonly string[])[];
  /** Later parts of the name, which usually say where the place is. */
  readonly secondary: readonly (readonly string[])[];
}

const PART = /\s*(?:,|;|\||@|\/|\s[-–—]\s|–|—)\s*/u;

function withoutPhrases(
  tokens: readonly string[],
  ignore: readonly (readonly string[])[],
): string[] {
  let rest = [...tokens];
  for (const phrase of ignore) {
    if (phrase.length === 0) continue;
    for (let at = 0; at + phrase.length <= rest.length; at += 1) {
      if (phrase.every((token, i) => rest[at + i] === token)) {
        rest = [...rest.slice(0, at), ...rest.slice(at + phrase.length)];
        at -= 1;
      }
    }
  }
  return rest;
}

/**
 * The names inside one place name. `ignore` holds phrases that name the destination itself
 * ("da nang", "vietnam"): they are in half the rows and identify nothing.
 */
export function nameAliases(
  name: string,
  ignore: readonly (readonly string[])[] = [],
): NameAliases {
  const parts = name.split(PART).filter((part) => part.trim().length > 0);
  const primary: string[][] = [];
  const secondary: string[][] = [];
  parts.forEach((part, index) => {
    const bracketed = [...part.matchAll(/\(([^)]*)\)/gu)].map((m) => m[1] ?? '');
    const outside = part.replace(/\([^)]*\)/gu, ' ');
    for (const text of [outside, ...bracketed]) {
      const tokens = withoutPhrases(nameTokens(text), ignore);
      if (tokens.length === 0) continue;
      (index === 0 ? primary : secondary).push(tokens);
    }
  });
  return { primary, secondary };
}

/** Phrases to ignore for a destination label such as "Đà Nẵng, Vietnam". */
export function destinationPhrases(destination: string): string[][] {
  const phrases = destination
    .split(',')
    .map((part) => nameTokens(part))
    .filter((tokens) => tokens.length > 0);
  // Place names also write the country in two words ("Việt Nam").
  const split = phrases.some((p) => p.length === 1 && p[0] === 'vietnam') ? [['viet', 'nam']] : [];
  return [...phrases, ...split];
}

function containsRun(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let at = 0; at + needle.length <= haystack.length; at += 1) {
    if (needle.every((token, i) => haystack[at + i] === token)) return true;
  }
  return false;
}

/** A name worth matching on: two words, or one long one ("Asia" alone names nothing). */
function distinctive(alias: readonly string[]): boolean {
  return alias.length >= 2 || (alias[0]?.length ?? 0) >= 6;
}

export interface WishMatches {
  /** Places whose own name is in the wish (the longest such name wins), editorial rows first. */
  readonly named: readonly DraftPoi[];
  /** Curated places that only mention the wished name as where they are. */
  readonly near: readonly DraftPoi[];
}

/**
 * Places a hand-typed must-do names. Among curated places every one whose name is in the text is
 * kept (only those with the longest matching name, so "Marble Mountains Elevator" beats "Marble
 * Mountains" when the wish says so). Open-data places are used only when no curated place is
 * named: their names are noisy, so the name must be at least two words.
 */
export function matchWish(
  wish: string,
  places: readonly DraftPoi[],
  ignore: readonly (readonly string[])[] = [],
): WishMatches {
  const text = withoutPhrases(nameTokens(wish), ignore);
  const longest = (poi: DraftPoi, kind: 'primary' | 'secondary'): number =>
    Math.max(
      0,
      ...nameAliases(poi.name, ignore)
        [kind].filter((alias) => distinctive(alias) && containsRun(text, alias))
        .map((alias) => alias.length),
    );
  const best = (pool: readonly DraftPoi[], least: number): DraftPoi[] => {
    const scored = pool.map((poi) => ({ poi, length: longest(poi, 'primary') }));
    const top = Math.max(0, ...scored.map((s) => s.length));
    return top < least ? [] : scored.filter((s) => s.length === top).map((s) => s.poi);
  };
  const curated = places.filter((poi) => poi.editorial);
  const named = best(curated, 1);
  const byId = (a: DraftPoi, b: DraftPoi) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const taken = new Set(named.map((poi) => poi.id));
  const near = curated
    .filter((poi) => !taken.has(poi.id) && longest(poi, 'secondary') > 0)
    .sort(byId);
  if (named.length > 0) return { named: [...named].sort(byId), near };
  return {
    named: best(
      places.filter((poi) => !poi.editorial),
      2,
    ).sort(byId),
    near,
  };
}
