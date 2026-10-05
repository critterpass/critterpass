/**
 * A destination's first-timer picks: its recommended places (the curated set, or the machine
 * picks where nothing is curated). Must-sees come first, then the machine picks by rank. A curated
 * set with no must-sees marked has no rank of its own, so there sights lead: temples and shrines,
 * nature, beaches, museums and markets before places to eat, and those before nightlife, three of
 * a kind at a time so the row is not one kind only. Within a kind the crew's (or the viewer's)
 * taste tags decide, then how well the place is sourced; never the alphabet. Commission-neutral: nothing a
 * partner pays for moves an organic pick; the sponsored slot is added separately and labelled.
 * Rows that are one place (a beach under three sources, a mountain under three names) are picked
 * once.
 */
import { QUALITY_SCORE, recommendedSql } from '@cp/db';
import { distinctPlaces, localizedEditorial, readEditorialOverlay } from '@cp/domain';
import type pg from 'pg';

import { onePerPlace } from '../places/same-place';

export const PICKS_LIMIT = 8;
/** How many of one kind lead before the next kind has its turn. */
export const PICKS_PER_KIND = 3;

/** Kinds of place in the order a first-timer's picks lead with them. */
export const PICK_KIND_ORDER = [
  'temple_shrine',
  'nature',
  'beach',
  'museum',
  'market',
  'other',
  'shopping',
  'health',
  'food',
  'nightlife',
  'transit',
  'stay',
] as const;

/** A place's position in `PICK_KIND_ORDER`, as SQL over its `category`. */
export function pickKindRankSql(alias = 'p'): string {
  const whens = PICK_KIND_ORDER.map((kind, index) => `WHEN '${kind}' THEN ${String(index)}`).join(
    ' ',
  );
  return `(CASE ${alias}.category ${whens} ELSE ${String(PICK_KIND_ORDER.length)} END)`;
}
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
    Omit<DestinationPick, 'why_go'> & {
      lat: number;
      lng: number;
      destination: string;
      editorial: unknown;
      reader_locale: string;
    }
  >(
    `WITH ranked AS (
       SELECT p.id AS poi_id, p.name, p.name_local, p.category, p.tags, p.lat, p.lng, p.pick_rank,
              (SELECT d.name FROM destinations d WHERE d.id = p.destination_id) AS destination,
              coalesce((p.editorial->>'must_see')::boolean, false) AS must_see,
              p.editorial, app.user_locale(app.uid()) AS reader_locale,
              cardinality(ARRAY(SELECT lower(t) FROM unnest(p.tags) t
                                 INTERSECT SELECT unnest($2::text[]))) AS taste_matches,
              ${pickKindRankSql('p')} AS kind_rank, ${QUALITY_SCORE} AS quality
         FROM pois p
        WHERE p.destination_id = $1 AND ${recommendedSql('p')} AND p.status = 'active'
          AND p.merged_into_id IS NULL AND p.category <> 'stay'),
     turns AS (
       SELECT *, row_number() OVER (
                   PARTITION BY must_see, kind_rank
                   ORDER BY taste_matches DESC, quality DESC, poi_id) AS in_kind
         FROM ranked)
     SELECT poi_id, name, name_local, category, tags, lat, lng, destination, must_see, editorial,
            reader_locale, taste_matches
       FROM turns
      ORDER BY must_see DESC, pick_rank ASC NULLS LAST, (in_kind - 1) / $4::int, kind_rank, in_kind
      LIMIT $3`,
    [destinationId, taste, PICKS_LIMIT * READ_PER_PICK, PICKS_PER_KIND],
  );
  const destination = rows[0]?.destination ?? '';
  // The note's reason in the reader's app language where it has been written in it.
  const picks = rows.map(({ editorial, reader_locale: locale, ...row }) => ({
    ...row,
    why_go: localizedEditorial(readEditorialOverlay(editorial), locale).why_go ?? null,
  }));
  return onePerPlace(distinctPlaces(picks, destination), destination)
    .slice(0, PICKS_LIMIT)
    .map(({ lat: _lat, lng: _lng, destination: _destination, ...pick }) => pick);
}
