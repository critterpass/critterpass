/**
 * Foursquare Places API live open/closed check: on a detail open where `last_live_check_at` is more
 * than 24h stale, store only `is_open_now`, `closed_permanently` and `checked_at` — no Foursquare
 * content persisted beyond those flags. Verified against the live API with the project's real key
 * (docs.foursquare.com/fsq-developers-places): `GET https://places-api.foursquare.com/places/
 * {fsq_place_id}?fields=hours,date_closed` with `Authorization: Bearer <key>` and
 * `X-Places-Api-Version: 2025-06-17`; `date_closed` is a Core (free) field, `hours.open_now` is a
 * billed Pro field. The configured key has zero purchased credits (verified: `hours`/`closed_bucket`
 * both 429 "no API credits remaining", `name`/`date_closed` 200) — a real, documented account/billing
 * gate, distinguished below from an ordinary rate limit so it degrades to "unknown" rather than
 * erroring.
 */
import { DomainError } from '@cp/domain';
import { withSystem } from '@cp/db';
import type pg from 'pg';

export interface LiveCheckHttpClient {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface FoursquareLiveCheckConfig {
  readonly apiKey: string;
  readonly apiVersion?: string;
  readonly baseUrl?: string;
}

export interface LiveCheckResult {
  readonly isOpenNow: boolean | null;
  readonly closedPermanently: boolean;
  readonly checkedAt: Date;
  /** True when the account has no credits for the billed `hours` field (see file header). */
  readonly gated: boolean;
}

const DEFAULT_API_VERSION = '2025-06-17';
const DEFAULT_BASE_URL = 'https://places-api.foursquare.com';
const REQUEST_TIMEOUT_MS = 10_000;
const DEBOUNCE_MS = 24 * 60 * 60 * 1000;

interface FoursquarePlaceDetailsResponse {
  readonly hours?: { readonly open_now?: boolean };
  readonly date_closed?: string | null;
}

interface FoursquareErrorResponse {
  readonly message?: string;
}

function isCreditsGateMessage(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const message = (body as FoursquareErrorResponse).message;
  return typeof message === 'string' && message.includes('API credits');
}

/** True once `lastLiveCheckAt` is more than 24h old, or there has never been a check. */
export function shouldRunLiveCheck(lastLiveCheckAt: Date | null, now: Date = new Date()): boolean {
  if (lastLiveCheckAt === null) return true;
  return now.getTime() - lastLiveCheckAt.getTime() >= DEBOUNCE_MS;
}

/**
 * Calls the real Foursquare Places API for one place. Never persists anything itself (see
 * `checkPoiLiveStatus` for the store step) and never throws for the account-credits gate — that
 * degrades to `{gated: true}` so a live-check job across many POIs keeps going rather than failing.
 */
export async function fetchFoursquareLiveStatus(
  fsqPlaceId: string,
  config: FoursquareLiveCheckConfig,
  httpClient: LiveCheckHttpClient = globalThis,
): Promise<LiveCheckResult> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/places/${encodeURIComponent(fsqPlaceId)}?fields=hours,date_closed`;

  const response = await httpClient.fetch(url, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'X-Places-Api-Version': config.apiVersion ?? DEFAULT_API_VERSION,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 429) {
    const body: unknown = await response.json().catch(() => undefined);
    if (isCreditsGateMessage(body)) {
      return { isOpenNow: null, closedPermanently: false, checkedAt: new Date(), gated: true };
    }
    throw new DomainError('RATE_LIMITED', { reason: 'foursquare rate limit' });
  }
  if (!response.ok) {
    throw new DomainError('UPSTREAM_TIMEOUT', {
      reason: 'foursquare live check failed',
      status: response.status,
    });
  }

  const body = (await response.json()) as FoursquarePlaceDetailsResponse;
  return {
    isOpenNow: body.hours?.open_now ?? null,
    closedPermanently: typeof body.date_closed === 'string' && body.date_closed.length > 0,
    checkedAt: new Date(),
    gated: false,
  };
}

export interface CheckPoiLiveStatusResult {
  readonly ran: boolean;
  readonly result?: LiveCheckResult;
}

/**
 * Debounced live check for one POI: reads `pois.last_live_check_at`/`source_ids.fsq_os`, skips if
 * checked within 24h or the POI has no FSQ source id, else calls Foursquare and upserts
 * `poi_live_checks` (never `pois.last_live_check_at` when the call was `gated`, so a credit top-up
 * makes the very next open detail view re-check instead of waiting out a stale debounce window).
 */
export async function checkPoiLiveStatus(
  pool: pg.Pool,
  poiId: string,
  config: FoursquareLiveCheckConfig,
  httpClient?: LiveCheckHttpClient,
  now: Date = new Date(),
): Promise<CheckPoiLiveStatusResult> {
  const poi = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      source_ids: { fsq_os?: string };
      last_live_check_at: Date | null;
    }>('SELECT source_ids, last_live_check_at FROM pois WHERE id = $1', [poiId]);
    return rows[0];
  });
  const fsqPlaceId = poi?.source_ids.fsq_os;
  if (poi === undefined || fsqPlaceId === undefined) return { ran: false };
  if (!shouldRunLiveCheck(poi.last_live_check_at, now)) return { ran: false };

  const result = await fetchFoursquareLiveStatus(fsqPlaceId, config, httpClient);

  await withSystem(pool, async (tx) => {
    await tx.query(
      `INSERT INTO poi_live_checks (poi_id, is_open_now, closed_permanently, checked_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (poi_id) DO UPDATE SET
         is_open_now = EXCLUDED.is_open_now,
         closed_permanently = EXCLUDED.closed_permanently,
         checked_at = EXCLUDED.checked_at`,
      [poiId, result.isOpenNow, result.closedPermanently, result.checkedAt],
    );
    if (!result.gated) {
      await tx.query('UPDATE pois SET last_live_check_at = $1 WHERE id = $2', [
        result.checkedAt,
        poiId,
      ]);
    }
  });

  return { ran: true, result };
}
