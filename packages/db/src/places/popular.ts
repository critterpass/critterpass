/**
 * A destination's popular places: the few people are most likely to visit, and the only places
 * that get AI estimates (busy times, visit length, best time, tips, fee) and curated photos.
 *
 * Per destination, active and not merged into another row, in this order: the editors'
 * essentials, the ready brief's essentials by rank, the brief's eateries in their order, then the
 * editors' must-sees. Transit, stays and health places never count. At most `POPULAR_LIMIT`.
 * The profile warm-up, the estimates, the media proposals and `/v1/media` all read this one set.
 */
import type pg from 'pg';

/** The most places a destination calls popular. */
export const POPULAR_LIMIT = 40;

/** Categories that are never popular, whatever an editor or a brief says. */
export const UNPOPULAR_CATEGORIES = ['transit', 'stay', 'health'] as const;

/**
 * The popular set as SQL over one destination (`$1`), one row per place in order: `poi_id`,
 * `popular_rank` (1-based). Runs as the caller, so the tables' own policies apply.
 */
export const POPULAR_PLACES_SQL = `
  WITH brief AS (
    SELECT b.essentials, b.eateries FROM destination_briefs b
     WHERE b.destination_id = $1 AND b.status = 'ready'
  ),
  candidates AS (
    SELECT p.id, 1 AS tier, 0::bigint AS position
      FROM pois p
     WHERE p.destination_id = $1 AND (p.editorial->>'essential')::boolean IS TRUE
    UNION ALL
    SELECT (e.value->>'poi_id')::uuid, 2, coalesce((e.value->>'rank')::bigint, e.ordinality)
      FROM brief, jsonb_array_elements(brief.essentials) WITH ORDINALITY AS e(value, ordinality)
     WHERE e.value->>'poi_id' ~* '^[0-9a-f-]{36}$'
    UNION ALL
    SELECT (e.value->>'poi_id')::uuid, 3, e.ordinality
      FROM brief, jsonb_array_elements(brief.eateries) WITH ORDINALITY AS e(value, ordinality)
     WHERE e.value->>'poi_id' ~* '^[0-9a-f-]{36}$'
    UNION ALL
    SELECT p.id, 4, 0
      FROM pois p
     WHERE p.destination_id = $1 AND (p.editorial->>'must_see')::boolean IS TRUE
  ),
  best AS (
    SELECT DISTINCT ON (c.id) c.id, c.tier, c.position
      FROM candidates c
     ORDER BY c.id, c.tier, c.position
  )
  SELECT best.id AS poi_id,
         row_number() OVER (ORDER BY best.tier, best.position, p.name, p.id)::int AS popular_rank
    FROM best
    JOIN pois p ON p.id = best.id
   WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
     AND p.category <> ALL (ARRAY[${UNPOPULAR_CATEGORIES.map((c) => `'${c}'`).join(', ')}])
   ORDER BY popular_rank
   LIMIT ${POPULAR_LIMIT}`;

export interface PopularPlace {
  readonly poiId: string;
  readonly rank: number;
}

/** The destination's popular places in order; runs in the caller's transaction. */
export async function popularPlaces(
  tx: Pick<pg.PoolClient, 'query'>,
  destinationId: string,
): Promise<PopularPlace[]> {
  const { rows } = await tx.query<{ poi_id: string; popular_rank: number }>(POPULAR_PLACES_SQL, [
    destinationId,
  ]);
  return rows.map((row) => ({ poiId: row.poi_id, rank: row.popular_rank }));
}

/** Whether one place is in its destination's popular set; runs in the caller's transaction. */
export async function isPopularPlace(
  tx: Pick<pg.PoolClient, 'query'>,
  poiId: string,
): Promise<boolean> {
  const { rows } = await tx.query<{ popular: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pois target
        CROSS JOIN LATERAL (${POPULAR_PLACES_SQL.replaceAll('$1', 'target.destination_id')}) popular
        WHERE target.id = $1 AND popular.poi_id = target.id) AS popular`,
    [poiId],
  );
  return rows[0]?.popular ?? false;
}
