/**
 * Our own places as a geocoder: `/v1/geocode` answers from `pois` and `cities` before it ever asks
 * Mapbox, and the worker places a booking's pickup on one of a destination's POIs. Trigram and
 * full-text matches only; runs in the caller's transaction.
 */
import type pg from 'pg';

export interface GeocodeResult {
  readonly source: 'poi' | 'city' | 'mapbox';
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
  readonly poiId?: string;
  readonly cityId?: string;
}

const LOCAL_MATCH_LIMIT = 5;

/** POIs then cities whose name is like the query, best first, at most five of each. */
export async function geocodeForwardLocal(
  tx: pg.PoolClient,
  query: string,
): Promise<readonly GeocodeResult[]> {
  const [pois, cities] = await Promise.all([
    tx.query<{ id: string; name: string; address: string | null; lat: number; lng: number }>(
      `SELECT id, name, address, lat, lng FROM pois
       WHERE status = 'active' AND (fts @@ websearch_to_tsquery('simple', app.unaccent_immutable($1)) OR name % $1)
       ORDER BY similarity(name, $1) DESC LIMIT $2`,
      [query, LOCAL_MATCH_LIMIT],
    ),
    tx.query<{ id: string; name: string; country: string; lat: number; lng: number }>(
      `SELECT id, name, country, lat, lng FROM cities WHERE name % $1
       ORDER BY similarity(name, $1) DESC LIMIT $2`,
      [query, LOCAL_MATCH_LIMIT],
    ),
  ]);

  return [
    ...pois.rows.map((row) => ({
      source: 'poi' as const,
      label: row.address !== null ? `${row.name}, ${row.address}` : row.name,
      lat: row.lat,
      lng: row.lng,
      poiId: row.id,
    })),
    ...cities.rows.map((row) => ({
      source: 'city' as const,
      label: `${row.name}, ${row.country}`,
      lat: row.lat,
      lng: row.lng,
      cityId: row.id,
    })),
  ];
}

export interface OwnPlaceArea {
  readonly destinationId: string;
  readonly lat: number;
  readonly lng: number;
  readonly radiusM: number;
}

export interface OwnPlaceMatch {
  readonly poiId: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  /** pg_trgm `similarity(name, query)`: the whole name against the whole query. */
  readonly similarity: number;
  /** pg_trgm `strict_word_similarity(name, query)`: the name as whole words inside the query. */
  readonly wordSimilarity: number;
}

/**
 * A destination's active POIs inside `area` whose name (or local name) is like the query, with
 * their trigram scores, best first; deciding which one is good enough is the caller's rule.
 */
export async function ownPlaceMatches(
  tx: pg.PoolClient,
  query: string,
  area: OwnPlaceArea,
): Promise<readonly OwnPlaceMatch[]> {
  const { rows } = await tx.query<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    similarity: number;
    word_similarity: number;
  }>(
    `SELECT id, name, lat, lng, similarity, word_similarity FROM (
       SELECT id, name, lat, lng,
              greatest(similarity(name, $1), similarity(coalesce(name_local, ''), $1)) AS similarity,
              greatest(strict_word_similarity(name, $1),
                       strict_word_similarity(coalesce(name_local, ''), $1)) AS word_similarity
         FROM pois
        WHERE status = 'active' AND destination_id = $2
          AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5)
          AND (name <<% $1 OR coalesce(name_local, '') <<% $1 OR name % $1)
     ) AS scored
     ORDER BY word_similarity DESC, similarity DESC, id LIMIT $6`,
    [query, area.destinationId, area.lat, area.lng, area.radiusM, LOCAL_MATCH_LIMIT],
  );
  return rows.map((row) => ({
    poiId: row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    similarity: Number(row.similarity),
    wordSimilarity: Number(row.word_similarity),
  }));
}
