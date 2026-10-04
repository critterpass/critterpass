/**
 * A place mention from a post, matched to our own places inside the trip's destination. Code, not
 * the model, decides: the mention's words against each candidate's name and editorial tags
 * (accents and đ folded), its kind of place against the category, and its area (or a maps link's
 * point) against the address. Sure is a score of at least 0.85 with no rival within 0.1; two or
 * three close candidates are ambiguous (the phone asks which); anything else is unknown.
 */
import type { PoiCategory } from '@cp/domain';
import type pg from 'pg';

export const SURE_SCORE = 0.85;
export const RIVAL_GAP = 0.1;
/** A best candidate below this is not worth asking about. */
const ASK_FLOOR = 0.5;
const MAX_CHOICES = 3;
const CANDIDATES = 40;
/** A maps link's pin counts as this place when it is this close (metres). */
const PIN_SAME_M = 150;
const PIN_NEAR_M = 1000;

const STOP_WORDS = new Set(
  'the a an and of with at in on to by for near from my our this that these those best'.split(' '),
);

export interface Mention {
  readonly label: string;
  readonly kindHint: PoiCategory | null;
  readonly areaHint: string | null;
  readonly point: { readonly lat: number; readonly lng: number } | null;
}

export interface MatchCandidate {
  readonly poiId: string;
  readonly name: string;
  readonly category: PoiCategory;
  readonly address: string | null;
  readonly score: number;
}

export type MatchOutcome =
  | { readonly kind: 'sure'; readonly candidate: MatchCandidate }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly MatchCandidate[] }
  | { readonly kind: 'unknown' };

export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase();
}

export function tokens(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

interface Row {
  readonly id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: PoiCategory;
  readonly address: string | null;
  readonly tags: string[];
  readonly distance_m: number | null;
}

function nameScore(label: readonly string[], row: Row): number {
  const name = new Set(tokens(`${row.name} ${row.name_local ?? ''}`));
  const tagged = new Set([...name, ...row.tags.flatMap((tag) => tokens(tag.replace(/_/gu, ' ')))]);
  const covered = label.filter((word) => tagged.has(word)).length / label.length;
  const inName = label.filter((word) => name.has(word)).length;
  const precision = name.size === 0 ? 0 : inName / name.size;
  return 0.85 * covered + 0.15 * precision;
}

function areaScore(mention: Mention, row: Row): number {
  if (mention.point !== null && row.distance_m !== null) {
    if (row.distance_m <= PIN_SAME_M) return 1;
    return row.distance_m <= PIN_NEAR_M ? 0.5 : 0;
  }
  if (mention.areaHint === null || mention.areaHint.trim() === '') return 0.5;
  const area = fold(mention.areaHint).trim();
  return fold(`${row.address ?? ''} ${row.name}`).includes(area) ? 1 : 0;
}

export function scoreCandidate(mention: Mention, label: readonly string[], row: Row): number {
  const category = mention.kindHint === null ? 0.5 : mention.kindHint === row.category ? 1 : 0;
  return 0.7 * nameScore(label, row) + 0.15 * category + 0.15 * areaScore(mention, row);
}

/** Sure, ambiguous or unknown from scored candidates. */
export function decide(scored: readonly MatchCandidate[]): MatchOutcome {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  if (best === undefined || best.score < ASK_FLOOR) return { kind: 'unknown' };
  const close = sorted.filter((candidate) => best.score - candidate.score < RIVAL_GAP);
  if (close.length === 1)
    return best.score >= SURE_SCORE ? { kind: 'sure', candidate: best } : { kind: 'unknown' };
  return { kind: 'ambiguous', candidates: close.slice(0, MAX_CHOICES) };
}

export async function matchMention(
  tx: pg.PoolClient,
  destinationId: string,
  mention: Mention,
): Promise<MatchOutcome> {
  const label = tokens(mention.label);
  if (label.length === 0 && mention.point === null) return { kind: 'unknown' };
  const point = mention.point;
  const { rows } = await tx.query<Row>(
    `SELECT p.id, p.name, p.name_local, p.category, p.address, p.tags,
            CASE WHEN $4::float8 IS NULL THEN NULL
                 ELSE ST_Distance(p.location, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography)
            END AS distance_m
       FROM pois p
      WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
        AND (($2 <> '' AND p.fts @@ websearch_to_tsquery('simple', app.unaccent_immutable($2)))
             OR ($3 <> '' AND p.name % $3)
             OR ($4::float8 IS NOT NULL AND ST_DWithin(p.location,
                   ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography, $6)))
      LIMIT $7`,
    [
      destinationId,
      label.join(' or '),
      mention.label,
      point?.lat ?? null,
      point?.lng ?? null,
      PIN_NEAR_M,
      CANDIDATES,
    ],
  );
  if (label.length === 0) {
    // A pin with no name: the place standing on it, if one does.
    const nearest = rows
      .filter((row) => row.distance_m !== null && row.distance_m <= PIN_SAME_M)
      .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0))[0];
    return nearest === undefined
      ? { kind: 'unknown' }
      : { kind: 'sure', candidate: { ...toCandidate(nearest), score: 1 } };
  }
  return decide(
    rows.map((row) => ({ ...toCandidate(row), score: scoreCandidate(mention, label, row) })),
  );
}

function toCandidate(row: Row): Omit<MatchCandidate, 'score'> {
  return { poiId: row.id, name: row.name, category: row.category, address: row.address };
}
