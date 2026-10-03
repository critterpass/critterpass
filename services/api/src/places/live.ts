/**
 * `GET /v1/places/{id}/live` (docs/api-contracts.md §5.5; docs/product-decisions.md D24): one live
 * Foursquare Place Details call per request, passed through and never stored. Foursquare's usage
 * guidelines allow a Pay as You Go account to cache no attribute but the place id, so this route has
 * no server cache and answers `Cache-Control: no-store`. The place screen loads our own detail from
 * `GET /v1/places/{id}` and asks this route in parallel; it always answers, with `available: false`
 * when the POI has no Foursquare id, the monthly call cap is reached, or Foursquare errs or is slow.
 */
import {
  DomainError,
  FOURSQUARE_DETAIL_FIELDS,
  mapFoursquareDetails,
  UNAVAILABLE_PLACE_LIVE,
  type PlaceLive,
} from '@cp/domain';
import { withSystem } from '@cp/db';
import type pg from 'pg';

export interface FoursquareLiveConfig {
  readonly apiKey: string;
  /** Calls per UTC month across the api and the worker (`app.reserve_foursquare_call`). */
  readonly monthlyCallCap: number;
  readonly apiVersion?: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  /** Ops log when the cap turns a call away, or when Foursquare fails. */
  readonly onCapReached?: (poiId: string) => void;
  readonly onError?: (poiId: string, error: unknown) => void;
}

const DEFAULT_API_VERSION = '2025-06-17';
const DEFAULT_BASE_URL = 'https://places-api.foursquare.com';
const DEFAULT_TIMEOUT_MS = 2_500;

/** The POI's Foursquare id: the open-data link first, else the curated match; 404 when not active. */
async function foursquareIdOf(pool: pg.Pool, poiId: string): Promise<string | null> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ fsq_place_id: string | null }>(
      `SELECT coalesce(p.source_ids->>'fsq_os', f.fsq_place_id) AS fsq_place_id
       FROM pois p LEFT JOIN poi_foursquare_ids f ON f.poi_id = p.id
       WHERE p.id = $1 AND p.status = 'active'`,
      [poiId],
    );
    const row = rows[0];
    if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'poi not found', poiId });
    return row.fsq_place_id;
  });
}

async function reserveCall(pool: pg.Pool, cap: number): Promise<boolean> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ ok: boolean }>(
      "SELECT app.reserve_foursquare_call('details', $1) AS ok",
      [cap],
    );
    return rows[0]?.ok === true;
  });
}

export async function getPlaceLive(
  pool: pg.Pool,
  poiId: string,
  config: FoursquareLiveConfig | undefined,
): Promise<PlaceLive> {
  const fsqPlaceId = await foursquareIdOf(pool, poiId);
  if (config === undefined || fsqPlaceId === null) return UNAVAILABLE_PLACE_LIVE;
  if (!(await reserveCall(pool, config.monthlyCallCap))) {
    config.onCapReached?.(poiId);
    return UNAVAILABLE_PLACE_LIVE;
  }

  const url = `${config.baseUrl ?? DEFAULT_BASE_URL}/places/${encodeURIComponent(fsqPlaceId)}?fields=${FOURSQUARE_DETAIL_FIELDS}`;
  const fetcher = config.fetch ?? globalThis.fetch;
  try {
    const response = await fetcher(url, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'X-Places-Api-Version': config.apiVersion ?? DEFAULT_API_VERSION,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      config.onError?.(poiId, new Error(`foursquare place details ${response.status}`));
      return UNAVAILABLE_PLACE_LIVE;
    }
    return mapFoursquareDetails(await response.json());
  } catch (error) {
    config.onError?.(poiId, error);
    return UNAVAILABLE_PLACE_LIVE;
  }
}
