/**
 * Which of our open-data rows a curated place is. The researcher's point is approximate, so a row
 * must carry the place's name (English or local, the same words as the pick matcher's rules) and
 * lie near that point: the same name within `SAME_NAME_RADIUS_M`, a name one word apart within
 * `CLOSE_NAME_RADIUS_M`. A row further than `STRONG_NAME_RADIUS_M` must carry the place's full
 * name (English or local, accents and case aside): sharing the words is not enough there ("Time
 * Square Square" 900 m off is not Times Square). Two Latin names that each hold two telling words
 * the other lacks are different places, whatever their local names say ("Banker-Tattoo Train Night
 * Market Ratchada" is not "Rot Fai Ratchada Train Night Market"). Among rows that qualify, the
 * closer name wins, then the same kind of place, then the nearer row. Short of that, a row whose
 * name is nearly the same text (`SIMILAR_TEXT`, for scripts written without spaces) close to the
 * point (`SIMILAR_RADIUS_M`). A place no row carries is reported and never created from the
 * researcher's point: open data stays the source of a place's name, point and address.
 */
import type { PlacePickKind } from '@cp/ai';
import { QUALITY_SCORE } from '@cp/db';
import type { PoiCategory } from '@cp/domain';
import type pg from 'pg';

import { nameAliases, nameTokens } from '@cp/planner';

import { rankNamedPlace, searchWords, SAME_NAME_SCORE, type PickCandidate } from '../pick/match';

export const SAME_NAME_RADIUS_M = 1_500;
export const CLOSE_NAME_RADIUS_M = 400;
/** Rows read per curated place. */
const CANDIDATES = 40;
/** Trigram similarity at which a row's name is read as a candidate (scripts without spaces). */
const SIMILAR = 0.3;
/** Trigram similarity and distance at which a row is the place without sharing its words. */
export const SIMILAR_TEXT = 0.5;
export const SIMILAR_RADIUS_M = 250;
/** Beyond this distance only the place's full name (English or local) is a match. */
export const STRONG_NAME_RADIUS_M = 250;
/** Telling words each of two Latin names must lack from the other to be different places. */
const DIFFERENT_WORDS = 2;
/** Rows nearer than this to each other count as equally near; the kind of place decides. */
const NEAR_STEP_M = 250;

export interface CuratedLead {
  readonly name: string;
  readonly localName: string | null;
  readonly category: PoiCategory;
  readonly lat: number;
  readonly lng: number;
}

export interface MatchCandidate extends PickCandidate {
  readonly distanceM: number;
  /** The best trigram similarity of the row's names to the place's names. */
  readonly similarity: number;
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

/** The destination's active rows near the lead whose name shares words with, or resembles, it. */
export async function curatedCandidates(
  tx: pg.PoolClient,
  destinationId: string,
  lead: CuratedLead,
  plain: ReadonlySet<string>,
): Promise<MatchCandidate[]> {
  const words = searchWords(
    { name: lead.name, localName: lead.localName, kind: pickKindOf(lead.category), area: null },
    plain,
  );
  const { rows } = await tx.query<{
    id: string;
    name: string;
    name_local: string | null;
    category: string;
    lat: number;
    lng: number;
    address: string | null;
    quality: number;
    distance_m: number;
    similarity: number;
  }>(
    `WITH here AS (SELECT ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography AS point)
     SELECT p.id, p.name, p.name_local, p.category, p.lat, p.lng, p.address,
            ${QUALITY_SCORE}::float8 AS quality,
            ST_Distance(p.location, here.point)::float8 AS distance_m,
            greatest(similarity(p.name, $6::text), similarity(p.name, $7::text),
                     similarity(coalesce(p.name_local, ''), $7::text),
                     similarity(coalesce(p.name_local, ''), $6::text))::float8 AS similarity
       FROM pois p, here
      WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
        AND ST_DWithin(p.location, here.point, $4::float8)
        AND (($5::text <> '' AND p.fts @@ to_tsquery('simple', $5::text))
             OR similarity(p.name, $6::text) >= $8::float4 OR similarity(p.name, $7::text) >= $8::float4
             OR similarity(coalesce(p.name_local, ''), $7::text) >= $8::float4
             OR similarity(coalesce(p.name_local, ''), $6::text) >= $8::float4)
      ORDER BY similarity DESC, distance_m, p.id
      LIMIT $9`,
    [
      destinationId,
      lead.lat,
      lead.lng,
      SAME_NAME_RADIUS_M,
      words.join(' | '),
      lead.name,
      lead.localName ?? lead.name,
      SIMILAR,
      CANDIDATES,
    ],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    nameLocal: row.name_local,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    quality: row.quality,
    distanceM: row.distance_m,
    similarity: row.similarity,
  }));
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

const fullName = (name: string | null): string => (name === null ? '' : nameTokens(name).join(' '));

/** Whether one of the row's names is one of the place's names, word for word. */
export function sameFullName(
  lead: CuratedLead,
  row: MatchCandidate,
  leadWords: ReadonlySet<string>,
) {
  const wanted = new Set([fullName(lead.name), fullName(lead.localName)]);
  wanted.delete('');
  return [row.name, withoutBranchNote(row.name, leadWords), row.nameLocal].some((name) =>
    wanted.has(fullName(name)),
  );
}

function tellingAliases(name: string, plain: ReadonlySet<string>): Set<string>[] {
  return nameAliases(name).primary.map(
    (tokens) => new Set(tokens.filter((token) => !plain.has(token))),
  );
}

function lacking(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let count = 0;
  for (const token of a) if (!b.has(token)) count += 1;
  return count;
}

/**
 * Whether the place's English name and the row's name are clearly different places: both Latin,
 * and every way of reading them leaves each with `DIFFERENT_WORDS` telling words the other lacks.
 */
export function clearlyDifferentNames(
  lead: CuratedLead,
  row: MatchCandidate,
  plain: ReadonlySet<string>,
): boolean {
  if (!LATIN.test(lead.name) || !LATIN.test(row.name)) return false;
  const ours = tellingAliases(lead.name, plain);
  const theirs = tellingAliases(row.name, plain);
  return ours.every((a) =>
    theirs.every((b) => lacking(a, b) >= DIFFERENT_WORDS && lacking(b, a) >= DIFFERENT_WORDS),
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
      (row.distanceM <= STRONG_NAME_RADIUS_M || sameFullName(lead, row, leadWords)),
  );
  const byId = new Map(open.map((row) => [row.id, row]));
  const ranked = rankNamedPlace(
    { name: lead.name, localName: lead.localName, kind: pickKindOf(lead.category), area: null },
    open.map((row) => ({ ...row, name: withoutBranchNote(row.name, leadWords) })),
    plain,
  );
  // `rankNamedPlace` puts the closer name and the same kind first; a clearly nearer row of the
  // same name goes ahead of one further off.
  const near = ranked
    .map((scored, order) => ({ ...scored, order, row: byId.get(scored.row.id) }))
    .filter(
      (c): c is { row: MatchCandidate; score: number; order: number } =>
        c.row !== undefined &&
        c.row.distanceM <= (c.score >= SAME_NAME_SCORE ? SAME_NAME_RADIUS_M : CLOSE_NAME_RADIUS_M),
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        Math.floor(a.row.distanceM / NEAR_STEP_M) - Math.floor(b.row.distanceM / NEAR_STEP_M) ||
        a.order - b.order,
    );
  const best = near[0];
  if (best !== undefined) return { kind: 'match', row: best.row, score: best.score };
  // Candidates arrive closest text first; a branch in the place's area is never the place.
  const similar = open.find(
    (row) =>
      row.similarity >= SIMILAR_TEXT &&
      row.distanceM <= SIMILAR_RADIUS_M &&
      withoutBranchNote(row.name, leadWords) === row.name,
  );
  if (similar !== undefined) return { kind: 'match', row: similar, score: similar.similarity };
  return { kind: 'none', closest: free[0] ?? null };
}
