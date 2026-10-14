/**
 * The rows near a curated place that may be it; the rules that choose among them
 * (`@cp/planner`'s curated name rules) are shared with the api's OpenStreetMap fallback.
 *
 * Which of our open-data rows a curated place is. The researcher's point is approximate, so a row
 * must carry the place's name (English or local, the same words as the pick matcher's rules) and
 * lie near that point: the same name within `SAME_NAME_RADIUS_M`, a name one word apart within
 * `CLOSE_NAME_RADIUS_M`. A row further than `STRONG_NAME_RADIUS_M` must carry the place's full
 * name (English or local; accents, case and the destination's own words aside): sharing the
 * words is not enough there ("Time Square Square" 900 m off is not Times Square). Two Latin names that each hold two telling words
 * the other lacks are different places, whatever their local names say ("Banker-Tattoo Train Night
 * Market Ratchada" is not "Rot Fai Ratchada Train Night Market"). Among rows that qualify, the
 * closer name wins, then the same kind of place, then the nearer row. Short of that, a row whose
 * name is nearly the same text (`SIMILAR_TEXT`, for scripts written without spaces) close to the
 * point (`SIMILAR_RADIUS_M`). A place no row carries is reported and never created from the
 * researcher's point: open data stays the source of a place's name, point and address.
 */
import { QUALITY_SCORE } from '@cp/db';
import {
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
