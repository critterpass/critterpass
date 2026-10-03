/**
 * Where the guide's place search measures distance from: a point, a place by id, a place named as
 * the traveller typed it ("ks avatar"), or the trip's stay (a crew plan item at a lodging place,
 * else a crew stay booking found by its title). Read as `guide_reader` through `llm.*` views only.
 */
import type { ReaderClient } from '@cp/ai';

import { parseGuidePlaceQuery } from './guide-place-query';

/** Curated by the content factory: the only quality signal the catalogue has (no ratings). */
export const RECOMMENDED = "(curation = 'editorial' OR must_see)";

export interface TripDestination {
  readonly id: string;
  readonly name: string | null;
}

export interface SearchReference {
  readonly id: string | null;
  /** The reference's name as the catalogue has it; null for a bare point. */
  readonly name: string | null;
  readonly lat: number;
  readonly lng: number;
}

export interface ReferenceInput {
  readonly near?: { readonly lat: number; readonly lng: number } | undefined;
  readonly place_id?: string | undefined;
  readonly near_name?: string | undefined;
  readonly near_stay?: boolean | undefined;
}

/** The trip's destination, when the asker is on the trip in context. */
export async function tripDestination(tx: ReaderClient): Promise<TripDestination | undefined> {
  const { rows } = await tx.query<{
    destination_id: string | null;
    destination_name: string | null;
  }>('SELECT destination_id, destination_name FROM llm.trip_context');
  const row = rows[0];
  return row?.destination_id == null
    ? undefined
    : { id: row.destination_id, name: row.destination_name };
}

type PoiRow = { id: string; name: string; lat: number; lng: number };

/** The catalogue place a typed name means: every word first, then the typed kind, then curated. */
export async function findPlaceByName(
  tx: ReaderClient,
  trip: TripDestination | undefined,
  typed: string,
): Promise<SearchReference | null> {
  const query = parseGuidePlaceQuery(typed, trip?.name);
  if (query.any === null || query.all === null) return null;
  const { rows } = await tx.query<PoiRow>(
    `SELECT id, name, lat, lng FROM llm.pois
      WHERE fts @@ to_tsquery('simple', $1) AND ($3::uuid IS NULL OR destination_id = $3)
      ORDER BY fts @@ to_tsquery('simple', $2) DESC, (category = $4) DESC, ${RECOMMENDED} DESC,
               ts_rank(fts, to_tsquery('simple', $1)) DESC, name
      LIMIT 1`,
    [query.any, query.all, trip?.id ?? null, query.kind ?? null],
  );
  return rows[0] ?? null;
}

async function tripStay(
  tx: ReaderClient,
  trip: TripDestination | undefined,
  tripId: string,
): Promise<SearchReference | null> {
  const planned = await tx.query<PoiRow>(
    `SELECT p.id, p.name, p.lat, p.lng FROM llm.plan_items i JOIN llm.pois p ON p.id = i.poi_id
      WHERE i.visibility = 'crew' AND p.category = 'stay'
      ORDER BY i.day_no, i.starts_at NULLS LAST LIMIT 1`,
  );
  if (planned.rows[0] !== undefined) return planned.rows[0];
  const booked = await tx.query<{ title: string | null }>(
    `SELECT title FROM llm.bookings WHERE trip_id = $1 AND type = 'stay' AND title IS NOT NULL
      ORDER BY starts_at NULLS LAST LIMIT 1`,
    [tripId === '' ? null : tripId],
  );
  const title = booked.rows[0]?.title;
  return title == null ? null : findPlaceByName(tx, trip, title);
}

/**
 * undefined: the search is not near anything; null: it is near a place that cannot be found (a
 * name not in the catalogue, a trip with no stay), so there is nothing to measure from.
 */
export async function resolveReference(
  tx: ReaderClient,
  trip: TripDestination | undefined,
  tripId: string,
  input: ReferenceInput,
): Promise<SearchReference | null | undefined> {
  if (input.near !== undefined) return { id: null, name: null, ...input.near };
  if (input.place_id !== undefined) {
    const { rows } = await tx.query<PoiRow>(
      'SELECT id, name, lat, lng FROM llm.pois WHERE id = $1',
      [input.place_id],
    );
    return rows[0] ?? null;
  }
  if (input.near_name !== undefined) return findPlaceByName(tx, trip, input.near_name);
  if (input.near_stay === true) return tripStay(tx, trip, tripId);
  return undefined;
}
