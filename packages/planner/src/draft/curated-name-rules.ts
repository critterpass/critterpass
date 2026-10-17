/**
 * Which of our open-data rows a curated place is. The researcher's point is approximate, so a row
 * must carry the place's name (English or local, the same words as the pick matcher's rules) and
 * lie near that point: the same name within `SAME_NAME_RADIUS_M`, a name one word apart within
 * `CLOSE_NAME_RADIUS_M`. A row further than `STRONG_NAME_RADIUS_M` must carry the place's full
 * name (English or local, or a name either carries in brackets; accents, case, word order,
 * joining words and the destination's own words aside): sharing the words is not enough there
 * ("Time Square Square" 900 m off is not Times Square). A full name of two words or more is the
 * same name ("El Mercado Ushuaia" is "El Mercado"); of one word, only within the short radius.
 * Two Latin names that each hold two telling words the other lacks are different places, whatever
 * their non-Latin local names say ("Banker-Tattoo Train Night Market Ratchada" is not "Rot Fai
 * Ratchada Train Night Market"), unless the row is written in the place's Latin local name.
 * A row of the wrong kind is never the place, and one of a clashing kind goes after one that is
 * not (`curated-kind-rules`: "IPPUDO Clarke Quay" is not Clarke Quay). Among rows that qualify,
 * the closer name wins, then the same kind of place, then the whole place over a part of it or a
 * business inside it (a room, a gate, a ticket office, a café: `PART_WORDS`), then the nearer row.
 * Full names are compared as `curated-full-names` folds them (spellings, Vietnamese head words,
 * names written joined). Short of that, a row whose name is nearly the same text (`SIMILAR_TEXT`,
 * for scripts written without spaces) close to the point (`SIMILAR_RADIUS_M`); short of that, a
 * row of the place's own full name further off, when no other row of that name stands elsewhere
 * (`farNamed`: the researcher's point can be kilometres off). A place no row carries is
 * reported and never created from the researcher's point: open data stays the source of a
 * place's name, point and address.
 */
import type { PoiCategory } from '@cp/domain';

import {
  rankNamedPlace,
  SAME_NAME_SCORE,
  type PickCandidate,
  type PlacePickKind,
} from './named-place-match';
import { kindClash, namesAnArea, wholeness, wrongKind } from './curated-kind-rules';
import { farNamed, sharedFullNameWords } from './curated-full-names';
import { nameAliases, nameTokens, namingWords } from './place-names';

export {
  FAR_NAME_RADIUS_M,
  NAMESAKE_RADIUS_M,
  SAME_PLACE_APART_M,
  SPELLING,
} from './curated-full-names';

export const SAME_NAME_RADIUS_M = 1_500;
export const CLOSE_NAME_RADIUS_M = 400;
/** Trigram similarity and distance at which a row is the place without sharing its words. */
export const SIMILAR_TEXT = 0.5;
export const SIMILAR_RADIUS_M = 250;
/** Beyond this distance only the place's full name (English or local) is a match. */
export const STRONG_NAME_RADIUS_M = 250;
/** Telling words each of two Latin names must lack from the other to be different places. */
const DIFFERENT_WORDS = 2;
/** Rows nearer than this to each other count as equally near; the kind of place decides. */
const NEAR_STEP_M = 250;
/** A full name of one telling word: a name one word apart, so only within `CLOSE_NAME_RADIUS_M`. */
const ONE_TELLING_WORD_SCORE = 0.9;

export interface CuratedLead {
  readonly name: string;
  readonly localName: string | null;
  readonly category: PoiCategory;
  readonly lat: number;
  readonly lng: number;
  /** The researcher's kind of place ("riverside bar strip"); absent for a typed search. */
  readonly subtype?: string | null;
}

export interface MatchCandidate extends PickCandidate {
  readonly distanceM: number;
  /** The best trigram similarity of the row's names to the place's names. */
  readonly similarity: number;
  /** The row is one of OSM's roads or districts (`curated-kind-rules`). */
  readonly mapsArea?: boolean;
}

export type CuratedMatch =
  | { readonly kind: 'match'; readonly row: MatchCandidate; readonly score: number }
  /** `closest`: the candidate whose name came closest (candidates arrive in that order). */
  | { readonly kind: 'none'; readonly closest: MatchCandidate | null };

const PICK_KINDS: ReadonlySet<string> = new Set([
  'temple_shrine',
  'museum',
  'nature',
  'beach',
  'market',
  'shopping',
  'food',
  'nightlife',
  'other',
]);

/** The pick kind a category reads as (transit and stays as `other`). */
export function pickKindOf(category: PoiCategory): PlacePickKind {
  return (PICK_KINDS.has(category) ? category : 'other') as PlacePickKind;
}

const LATIN = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}]+$/u;

/**
 * A row's name without a branch note: a Latin name with a Latin area in brackets ("MNG
 * (Myeongdong)") is a shop in that area, not the area, unless its own name shares a word with the
 * place. A bracket in another script, or in the same non-Latin script, is the name in another
 * form ("인사동 (Insadong)", "วัดพระเชตุพนฯ(วัดโพธิ์)") and stays.
 */
export function withoutBranchNote(name: string, leadWords: ReadonlySet<string>): string {
  const parts = /^(.+?)\s*\(([^)]+)\)\s*$/u.exec(name);
  const outside = parts?.[1]?.trim() ?? '';
  const inside = parts?.[2]?.trim() ?? '';
  if (outside === '' || !LATIN.test(outside) || !LATIN.test(inside)) return name;
  return nameTokens(outside).some((word) => leadWords.has(word)) ? name : outside;
}

/**
 * How many words the full name one of the row's names shares with one of the place's names
 * (`curated-full-names`), or 0 when none is the same. A branch's area in brackets is not one of
 * the row's names (`withoutBranchNote`); `telling` counts only a name that says which place it is.
 */
export function sharedFullName(
  lead: CuratedLead,
  row: MatchCandidate,
  plain: ReadonlySet<string>,
  leadWords: ReadonlySet<string>,
  telling = false,
): number {
  return sharedFullNameWords(lead, row, plain, withoutBranchNote(row.name, leadWords), telling);
}

/** Whether one of the row's names is one of the place's names, word for word. */
export function sameFullName(
  lead: CuratedLead,
  row: MatchCandidate,
  plain: ReadonlySet<string>,
  leadWords: ReadonlySet<string>,
): boolean {
  return sharedFullName(lead, row, plain, leadWords) > 0;
}

function tellingAliases(name: string, plain: ReadonlySet<string>): Set<string>[] {
  return nameAliases(name).primary.map(
    (tokens) => new Set(namingWords(tokens).filter((token) => !plain.has(token))),
  );
}

function lacking(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let count = 0;
  for (const token of a) if (!b.has(token)) count += 1;
  return count;
}

/**
 * Whether the place and the row's name are clearly different places: both Latin, and every way
 * of reading them leaves each with `DIFFERENT_WORDS` telling words the other lacks. A row written
 * in the place's Latin local name ("Chợ đêm Cà Mau" for "Ca Mau Night Market") is not different
 * when it shares a telling word with it and holds no two the other lacks ("Cafe 88 Cao Bằng" is
 * still not "Chợ Cao Bằng").
 */
export function clearlyDifferentNames(
  lead: CuratedLead,
  row: MatchCandidate,
  plain: ReadonlySet<string>,
): boolean {
  if (!LATIN.test(lead.name) || !LATIN.test(row.name)) return false;
  const theirs = tellingAliases(row.name, plain);
  const apart = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
    lacking(a, b) >= DIFFERENT_WORDS && lacking(b, a) >= DIFFERENT_WORDS;
  const english = tellingAliases(lead.name, plain).every((a) => theirs.every((b) => apart(a, b)));
  if (!english || lead.localName === null || !LATIN.test(lead.localName)) return english;
  return tellingAliases(lead.localName, plain).every((a) =>
    theirs.every((b) => apart(a, b) || lacking(a, b) === a.size),
  );
}

/** The row a curated place is among `candidates` (rows already taken left out), or none. */
export function chooseCuratedMatch(
  lead: CuratedLead,
  candidates: readonly MatchCandidate[],
  plain: ReadonlySet<string>,
  taken: ReadonlySet<string> = new Set(),
): CuratedMatch {
  const leadWords = new Set(nameTokens(`${lead.name} ${lead.localName ?? ''}`));
  const free = candidates.filter((row) => !taken.has(row.id));
  const open = free.filter(
    (row) =>
      !clearlyDifferentNames(lead, row, plain) &&
      !wrongKind(lead, row, plain) &&
      (row.distanceM <= STRONG_NAME_RADIUS_M || sameFullName(lead, row, plain, leadWords)),
  );
  const ranked = rankNamedPlace(
    { name: lead.name, localName: lead.localName, kind: pickKindOf(lead.category), area: null },
    open.map((row) => ({ ...row, name: withoutBranchNote(row.name, leadWords) })),
    plain,
  );
  // A row carrying the place's full name is the same name (one telling word only within a short
  // walk: "Hofgarten" is "Hofgarten Innsbruck", a bare "Market" 1 km off is not "Ca Mau Market").
  // `rankNamedPlace` puts the closer name and the same kind first; a clearly nearer row of the
  // same name goes ahead of one further off.
  const scored = new Map(ranked.map((c, order) => [c.row.id, { score: c.score, order }]));
  const near = open
    .map((row, index) => {
      const words = sharedFullName(lead, row, plain, leadWords);
      const full = words >= 2 ? SAME_NAME_SCORE : words === 1 ? ONE_TELLING_WORD_SCORE : 0;
      const rank = scored.get(row.id);
      const score = Math.max(full, rank?.score ?? 0);
      const clash = kindClash(lead, row) ? 1 : 0;
      const part = wholeness(row.name, plain, leadWords);
      return { row, score, clash, part, order: rank?.order ?? ranked.length + index };
    })
    .filter(
      (c) =>
        c.score > 0 &&
        c.row.distanceM <= (c.score >= SAME_NAME_SCORE ? SAME_NAME_RADIUS_M : CLOSE_NAME_RADIUS_M),
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.clash - b.clash ||
        a.part - b.part ||
        Math.floor(a.row.distanceM / NEAR_STEP_M) - Math.floor(b.row.distanceM / NEAR_STEP_M) ||
        a.order - b.order,
    );
  const best = near[0];
  if (best !== undefined) return { kind: 'match', row: best.row, score: best.score };
  // Candidates arrive closest text first; a branch in the place's area is never the place.
  // For a street or district, only a name in a script without spaces ("Robertson 100" is not
  // Robertson Quay).
  const area = namesAnArea(lead);
  const similar = open.find(
    (row) =>
      !(area && LATIN.test(row.name)) &&
      row.similarity >= SIMILAR_TEXT &&
      row.distanceM <= SIMILAR_RADIUS_M &&
      withoutBranchNote(row.name, leadWords) === row.name,
  );
  if (similar !== undefined) return { kind: 'match', row: similar, score: similar.similarity };
  // The point is approximate: a row of the place's own full name further off (`farNamed`).
  const [far] = farNamed(open, (row) => sharedFullName(lead, row, plain, leadWords, true)).sort(
    (a, b) =>
      Number(kindClash(lead, a)) - Number(kindClash(lead, b)) ||
      wholeness(a.name, plain, leadWords) - wholeness(b.name, plain, leadWords) ||
      a.distanceM - b.distanceM,
  );
  if (far !== undefined) return { kind: 'match', row: far, score: SAME_NAME_SCORE };
  return { kind: 'none', closest: free[0] ?? null };
}

function paddedTrigrams(text: string): ReadonlySet<string> {
  const normalised = `  ${text.toLowerCase().trim()}  `;
  const grams = new Set<string>();
  for (let index = 0; index <= normalised.length - 3; index += 1) {
    grams.add(normalised.slice(index, index + 3));
  }
  return grams;
}

/** Jaccard similarity over padded 3-grams, in `[0, 1]`; same shape as `pg_trgm`'s `similarity()`. */
export function trigramSimilarity(a: string, b: string): number {
  const gramsA = paddedTrigrams(a);
  const gramsB = paddedTrigrams(b);
  if (gramsA.size === 0 || gramsB.size === 0) return 0;
  let common = 0;
  for (const gram of gramsA) if (gramsB.has(gram)) common += 1;
  const union = gramsA.size + gramsB.size - common;
  return union === 0 ? 0 : common / union;
}
