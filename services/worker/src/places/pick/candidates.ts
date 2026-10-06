/**
 * The rows a named place may be: the destination's active rows whose words match either of its
 * names, closest name first. Transit, stays and health rows are never a pick; curated rows are
 * left out, because a destination with a curated set has no picks and no brief run.
 */
import type { NamedPlace } from '@cp/ai';
import { QUALITY_SCORE } from '@cp/db';
import type pg from 'pg';

import { searchWords, type PickCandidate } from './match';

/** Rows read per named place. */
export const NAME_CANDIDATES = 40;

export const NEVER_PICKED = ['transit', 'stay', 'health'];

export const CANDIDATE_COLUMNS = `p.id, p.name, p.name_local, p.category, p.lat, p.lng, p.address,
  ${QUALITY_SCORE}::float8 AS quality`;

export interface CandidateRow {
  readonly id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  readonly quality: number;
}

export const candidateOf = (row: CandidateRow): PickCandidate => ({
  id: row.id,
  name: row.name,
  nameLocal: row.name_local,
  category: row.category,
  lat: row.lat,
  lng: row.lng,
  address: row.address,
  quality: row.quality,
});

export async function namedCandidates(
  tx: pg.PoolClient,
  destinationId: string,
  lead: NamedPlace,
  plain: ReadonlySet<string>,
): Promise<PickCandidate[]> {
  const words = searchWords(lead, plain);
  if (words.length === 0) return [];
  const { rows } = await tx.query<CandidateRow>(
    `SELECT ${CANDIDATE_COLUMNS}
       FROM pois p
      WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
        AND p.curation <> 'editorial' AND p.category <> ALL($4::text[])
        AND p.fts @@ to_tsquery('simple', $2)
      ORDER BY greatest(similarity(p.name, $5), similarity(p.name, $6),
                        similarity(coalesce(p.name_local, ''), $6)) DESC,
               ts_rank(p.fts, to_tsquery('simple', $2)) DESC, p.id
      LIMIT $3`,
    // The words also match addresses (every shop on a street named after a sight), so rows
    // whose own name is closest to either name come first.
    [
      destinationId,
      words.join(' | '),
      NAME_CANDIDATES,
      NEVER_PICKED,
      lead.name,
      lead.localName ?? lead.name,
    ],
  );
  return rows.map(candidateOf);
}
