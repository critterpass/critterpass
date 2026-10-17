/**
 * The rows near a curated place that may be it; the rules that choose among them
 * (`@cp/planner`'s curated name rules) are shared with the api's OpenStreetMap fallback.
 *
 * Which of our open-data rows a curated place is: a row near the researcher's approximate point
 * that carries the place's name, English or local (the rules' own header says how close a name
 * and a point must be).
 *
 * A row is filed under the first destination whose ingest read it, so a neighbour or a wider
 * destination often holds the curated destination's places (Đà Nẵng's box covers Hội An's old
 * town; a country-wide Iceland holds Reykjavik). Candidates are read whatever destination owns
 * them. Another destination's row is claimable, and moves to the loading destination with its
 * note, when it lies inside the loading destination's place box and either outside its owner's box
 * or nearer the loading destination than the owner (each destination's own point, else the middle
 * of its box). Two destinations that both curate a row therefore agree on who keeps it. A row that
 * is not claimable stays with its owner: the place resolves to it, and its note is the owner's.
 */
import { QUALITY_SCORE } from '@cp/db';
import {
  chooseCuratedMatch,
  NAMESAKE_RADIUS_M,
  pickKindOf,
  SAME_NAME_RADIUS_M,
  searchWords,
  type CuratedLead,
  type MatchCandidate,
} from '@cp/planner';
import type pg from 'pg';

export {
  chooseCuratedMatch,
  clearlyDifferentNames,
  CLOSE_NAME_RADIUS_M,
  pickKindOf,
  SAME_NAME_RADIUS_M,
  sameFullName,
  SIMILAR_RADIUS_M,
  SIMILAR_TEXT,
  STRONG_NAME_RADIUS_M,
  withoutBranchNote,
  type CuratedLead,
  type CuratedMatch,
  type MatchCandidate,
} from '@cp/planner';

/** Rows read per curated place. */
const CANDIDATES = 40;
/** Trigram similarity at which a row's name is read as a candidate (scripts without spaces). */
const SIMILAR = 0.3;

/** A candidate row and who holds it. */
export interface OwnedCandidate extends MatchCandidate {
  /** The destination of the load owns the row. */
  readonly own: boolean;
  /** Another destination owns it, and the row is the loading destination's to take (header). */
  readonly claimable: boolean;
}

/**
 * Where a destination is, for deciding which of two destinations a row belongs to: its own point,
 * else the middle of its place box.
 */
const centreSql = (alias: string) =>
  `coalesce(ST_SetSRID(ST_MakePoint(${alias}.lng, ${alias}.lat), 4326)::geography,
            ST_Centroid(${alias}.place_bounds::geometry)::geography)`;

/**
 * Active rows within `radiusM` of the lead whose name shares words with, or resembles, it,
 * whatever destination owns them (see the file header for when another destination's row is
 * claimable).
 */
export async function curatedCandidates(
  tx: pg.PoolClient,
  destinationId: string,
  lead: CuratedLead,
  plain: ReadonlySet<string>,
  radiusM: number = SAME_NAME_RADIUS_M,
): Promise<OwnedCandidate[]> {
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
    own: boolean;
    claimable: boolean | null;
  }>(
    `WITH here AS (SELECT ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography AS point)
     SELECT p.id, p.name, p.name_local, p.category, p.lat, p.lng, p.address,
            ${QUALITY_SCORE}::float8 AS quality,
            ST_Distance(p.location, here.point)::float8 AS distance_m,
            greatest(similarity(p.name, $6::text), similarity(p.name, $7::text),
                     similarity(coalesce(p.name_local, ''), $7::text),
                     similarity(coalesce(p.name_local, ''), $6::text))::float8 AS similarity,
            p.destination_id = $1 AS own,
            p.destination_id <> $1 AND ST_Intersects(p.location, m.place_bounds)
              AND (o.place_bounds IS NULL OR NOT ST_Intersects(p.location, o.place_bounds)
                   OR ST_Distance(p.location, ${centreSql('m')})
                      < ST_Distance(p.location, ${centreSql('o')})) AS claimable
       FROM pois p JOIN destinations o ON o.id = p.destination_id, here,
            destinations m
      WHERE m.id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
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
      radiusM,
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
    own: row.own,
    claimable: row.claimable === true,
  }));
}

/** Who keeps the matched row: the loading destination owns it, takes it over, or leaves it. */
export type CuratedHold = 'own' | 'claim' | 'shared';

export type OwnedMatch =
  | { readonly kind: 'match'; readonly row: OwnedCandidate; readonly hold: CuratedHold }
  | { readonly kind: 'none'; readonly closest: MatchCandidate | null };

/**
 * The row a curated place is: one the destination owns first, so a load never moves a place it
 * already matched; else any destination's row, claimed when it is claimable and otherwise left
 * with its owner (`shared`: the place resolves to the row, the owner keeps it and its note).
 */
export function chooseAcrossOwners(
  lead: CuratedLead,
  candidates: readonly OwnedCandidate[],
  plain: ReadonlySet<string>,
  taken: ReadonlySet<string> = new Set(),
): OwnedMatch {
  const own = chooseCuratedMatch(
    lead,
    candidates.filter((row) => row.own),
    plain,
    taken,
  );
  const any = own.kind === 'match' ? own : chooseCuratedMatch(lead, candidates, plain, taken);
  if (any.kind === 'none') return any;
  // The rules hand back the candidate they chose; read its holder from the list.
  const row = candidates.find((candidate) => candidate.id === any.row.id);
  if (row === undefined) return { kind: 'none', closest: null };
  if (row.own) return { kind: 'match', row, hold: 'own' };
  return { kind: 'match', row, hold: row.claimable ? 'claim' : 'shared' };
}

/**
 * The row a curated place is: among the rows near its point, else among rows out to
 * `NAMESAKE_RADIUS_M`, where only the place's own full name within `FAR_NAME_RADIUS_M` will do
 * and only when no row of that name stands elsewhere (`@cp/planner`'s far rule: the researcher's
 * point can be kilometres off). `taken` rows are not the place.
 */
export async function findCuratedRow(
  tx: pg.PoolClient,
  destinationId: string,
  lead: CuratedLead,
  plain: ReadonlySet<string>,
  taken: ReadonlySet<string> = new Set(),
): Promise<OwnedMatch> {
  const near = await curatedCandidates(tx, destinationId, lead, plain);
  const verdict = chooseAcrossOwners(lead, near, plain, taken);
  if (verdict.kind === 'match') return verdict;
  const wide = await curatedCandidates(tx, destinationId, lead, plain, NAMESAKE_RADIUS_M);
  const far = chooseAcrossOwners(lead, wide, plain, taken);
  return far.kind === 'match' ? far : verdict;
}
