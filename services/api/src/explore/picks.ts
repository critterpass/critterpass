/**
 * A destination's first-timer picks: its recommended places (the curated set, or the machine
 * picks where nothing is curated), must-sees first, then by how many of the crew's (or the
 * viewer's) taste tags each one carries, then in the recommended order. Commission-neutral: nothing a
 * partner pays for moves an organic pick; the sponsored slot is added separately and labelled.
 * Rows that are one place (a beach under three sources) are picked once.
 */
import { recommendedOrderSql, recommendedSql } from '@cp/db';
import { distinctPlaces } from '@cp/domain';
import type pg from 'pg';

export const PICKS_LIMIT = 8;
/** Rows read per pick: room for the duplicates dropped before the limit. */
const READ_PER_PICK = 4;

export interface DestinationPick {
  readonly poi_id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string;
  readonly tags: readonly string[];
  readonly must_see: boolean;
  readonly why_go: string | null;
  readonly taste_matches: number;
}

/** Taste tags of the trip's crew when there is one, else the viewer's own. */
async function tasteTags(tx: pg.PoolClient, tripId: string | null): Promise<string[]> {
  const { rows } =
    tripId === null
      ? await tx.query<{ tag: string }>(
          'SELECT DISTINCT unnest(tags) AS tag FROM taste_profiles WHERE user_id = app.uid()',
        )
      : await tx.query<{ tag: string }>(
          `SELECT DISTINCT unnest(tp.tags) AS tag FROM taste_profiles tp
             JOIN trip_participants p ON p.user_id = tp.user_id
            WHERE p.trip_id = $1 AND p.rsvp IS DISTINCT FROM 'out'`,
          [tripId],
        );
  return rows.map((row) => row.tag.toLowerCase());
}

export async function readPicks(
  tx: pg.PoolClient,
  destinationId: string,
  tripId: string | null,
): Promise<DestinationPick[]> {
  const taste = await tasteTags(tx, tripId);
  const { rows } = await tx.query<
    DestinationPick & { lat: number; lng: number; destination: string }
  >(
    `SELECT p.id AS poi_id, p.name, p.name_local, p.category, p.tags, p.lat, p.lng,
            (SELECT d.name FROM destinations d WHERE d.id = p.destination_id) AS destination,
            coalesce((p.editorial->>'must_see')::boolean, false) AS must_see,
            p.editorial->>'why_go' AS why_go,
            cardinality(ARRAY(SELECT lower(t) FROM unnest(p.tags) t
                               INTERSECT SELECT unnest($2::text[]))) AS taste_matches
       FROM pois p
      WHERE p.destination_id = $1 AND ${recommendedSql('p')} AND p.status = 'active'
        AND p.merged_into_id IS NULL AND p.category <> 'stay'
      ORDER BY must_see DESC, taste_matches DESC, ${recommendedOrderSql('p')}, p.name, p.id
      LIMIT $3`,
    [destinationId, taste, PICKS_LIMIT * READ_PER_PICK],
  );
  return distinctPlaces(rows, rows[0]?.destination ?? '')
    .slice(0, PICKS_LIMIT)
    .map(({ lat: _lat, lng: _lng, destination: _destination, ...pick }) => pick);
}
