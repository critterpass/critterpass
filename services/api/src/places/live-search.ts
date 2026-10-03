/**
 * `GET /v1/places/search/live` (docs/api-contracts.md §5.5; docs/product-decisions.md D25): when our
 * own search finds few places for a query, one Foursquare Place Search call shows more, in a
 * separate section the app labels "Powered by Foursquare". The results are display-only: served
 * `no-store`, never written anywhere, and held in memory by the app. A result Foursquare and our
 * open data share (the same `fsq_place_id`) carries our `poiId`, so it can be saved straight away;
 * any other is made storable on pick by `./live-resolve.ts`.
 *
 * The call counts under the shared monthly Foursquare cap (`app.reserve_foursquare_call`). Nothing
 * is called when our results are enough, the query is too short, or Foursquare is not configured.
 */
import { FOURSQUARE_ATTRIBUTION, type PoiCategory } from '@cp/domain';
import { withSystem, withUser } from '@cp/db';
import type pg from 'pg';

import { searchFoursquare, type FoursquareSearchArea } from './foursquare-search';
import type { FoursquareLiveConfig } from './live';
import { searchPlaces } from './search';

/** Fewer of our own results than this and the query is worth a live search. */
export const WEAK_RESULT_COUNT = 5;
export const MIN_LIVE_QUERY_LENGTH = 3;
const LIVE_RESULT_LIMIT = 10;
/** Around the caller's own point: the walk-or-short-ride range a "near me" search means. */
const NEAR_RADIUS_M = 5_000;

export interface PlaceLiveSearchItem {
  readonly fsqPlaceId: string;
  /** Our POI with the same Foursquare id, when open data already has the place. */
  readonly poiId: string | null;
  readonly name: string;
  readonly category: PoiCategory;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  readonly distanceM: number | null;
}

export interface PlaceLiveSearch {
  readonly results: readonly PlaceLiveSearchItem[];
  readonly attribution: { readonly name: string; readonly url: string } | null;
}

export const EMPTY_LIVE_SEARCH: PlaceLiveSearch = { results: [], attribution: null };

export interface LiveSearchInput {
  readonly uid: string;
  readonly device: string;
  readonly q: string;
  readonly destinationId?: string;
  readonly near?: { readonly lat: number; readonly lng: number };
}

/** Around the caller, else the destination's place box, else its name for Foursquare to geocode. */
async function searchArea(
  pool: pg.Pool,
  input: LiveSearchInput,
): Promise<FoursquareSearchArea | null> {
  if (input.near !== undefined) return { kind: 'point', ...input.near, radiusM: NEAR_RADIUS_M };
  if (input.destinationId === undefined) return null;
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      name: string;
      country: string | null;
      lat: number | null;
      lng: number | null;
      radius_m: number | null;
    }>(
      `SELECT d.name, d.country,
              ST_Y(ST_Centroid(d.place_bounds::geometry)) AS lat,
              ST_X(ST_Centroid(d.place_bounds::geometry)) AS lng,
              ST_Distance(ST_Centroid(d.place_bounds::geometry)::geography,
                          ST_PointN(ST_ExteriorRing(d.place_bounds::geometry), 1)::geography) AS radius_m
       FROM destinations d WHERE d.id = $1`,
      [input.destinationId],
    );
    const row = rows[0];
    if (row === undefined) return null;
    if (row.lat !== null && row.lng !== null && row.radius_m !== null) {
      return { kind: 'point', lat: row.lat, lng: row.lng, radiusM: row.radius_m };
    }
    return { kind: 'near', text: row.country === null ? row.name : `${row.name}, ${row.country}` };
  });
}

async function reserveSearchCall(pool: pg.Pool, cap: number): Promise<boolean> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ ok: boolean }>(
      "SELECT app.reserve_foursquare_call('search', $1) AS ok",
      [cap],
    );
    return rows[0]?.ok === true;
  });
}

/** Our active POIs by Foursquare id: the open-data link, or the curated match. */
async function poiIdsByFoursquareId(
  pool: pg.Pool,
  fsqPlaceIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (fsqPlaceIds.length === 0) return new Map();
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string; fsq_place_id: string }>(
      `SELECT p.id, coalesce(p.source_ids->>'fsq_os', f.fsq_place_id) AS fsq_place_id
       FROM pois p LEFT JOIN poi_foursquare_ids f ON f.poi_id = p.id
       WHERE (p.source_ids->>'fsq_os' = ANY($1::text[]) OR f.fsq_place_id = ANY($1::text[]))
         AND p.status = 'active' AND p.merged_into_id IS NULL`,
      [fsqPlaceIds],
    );
    return new Map(rows.map((row) => [row.fsq_place_id, row.id]));
  });
}

export async function searchPlacesLive(
  pool: pg.Pool,
  input: LiveSearchInput,
  config: FoursquareLiveConfig | undefined,
): Promise<PlaceLiveSearch> {
  const q = input.q.trim();
  if (config === undefined || q.length < MIN_LIVE_QUERY_LENGTH) return EMPTY_LIVE_SEARCH;

  const ours = await withUser(pool, input.uid, input.device, (tx) =>
    searchPlaces(tx, {
      q,
      ...(input.destinationId === undefined ? {} : { destinationId: input.destinationId }),
      ...(input.near === undefined ? {} : { near: input.near }),
      limit: WEAK_RESULT_COUNT,
    }),
  );
  if (ours.length >= WEAK_RESULT_COUNT) return EMPTY_LIVE_SEARCH;

  const area = await searchArea(pool, input);
  if (area === null) return EMPTY_LIVE_SEARCH;
  const label = `search:${input.destinationId ?? 'near'}`;
  if (!(await reserveSearchCall(pool, config.monthlyCallCap))) {
    config.onCapReached?.(label);
    return EMPTY_LIVE_SEARCH;
  }

  let found;
  try {
    found = await searchFoursquare(config, q, area, LIVE_RESULT_LIMIT);
  } catch (error) {
    config.onError?.(label, error);
    return EMPTY_LIVE_SEARCH;
  }

  const shown = new Set(ours.map((place) => place.id));
  const poiIds = await poiIdsByFoursquareId(
    pool,
    found.map((place) => place.fsqPlaceId),
  );
  const results = found
    .map((place) => ({ ...place, poiId: poiIds.get(place.fsqPlaceId) ?? null }))
    .filter((place) => place.poiId === null || !shown.has(place.poiId));
  return { results, attribution: results.length === 0 ? null : FOURSQUARE_ATTRIBUTION };
}
