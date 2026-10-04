/**
 * Warms up place photos: reads the Foursquare photos of curated places that have a Foursquare id
 * and were never read, so lists and cards can show them before anyone opens the place
 * (docs/product-decisions.md D24). One Place Details call per place asking for the photos alone
 * (`fields=photos`; photos are a Premium field, so it is billed like the full details call). Every
 * call is counted under the shared monthly cap first (`app.reserve_foursquare_call`), and the run
 * stops at the call budget it is given. Only photo ids and image addresses are kept.
 *
 * A dry run counts the places and the calls the budget and the month's cap would allow; it calls
 * nothing, counts nothing against the cap and writes nothing.
 */
import { replacePoiFoursquarePhotos, withSystem } from '@cp/db';
import { FOURSQUARE_PHOTO_FIELDS, foursquareStoredPhotos } from '@cp/domain';
import type pg from 'pg';

import type { JobLogger } from '../boss/define-job';

export interface FoursquarePhotoWarmupConfig {
  readonly apiKey: string;
  /** Calls per UTC month across the api and the worker (`app.reserve_foursquare_call`). */
  readonly monthlyCallCap: number;
  readonly apiVersion?: string;
  readonly baseUrl?: string;
  readonly fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

export interface FoursquarePhotoWarmupOptions {
  /** The most Foursquare calls this run may make. */
  readonly maxCalls: number;
  /** One destination slug; unset = every destination. */
  readonly destination?: string;
  readonly dryRun?: boolean;
  readonly signal?: AbortSignal;
}

export interface FoursquarePhotoWarmupReport {
  /** Curated places with a Foursquare id whose photos were never read. */
  readonly places: number;
  /** Calls made (a dry run: calls the budget and the month's cap would allow). */
  readonly calls: number;
  readonly placesWithPhotos: number;
  readonly placesWithoutPhotos: number;
  readonly photosKept: number;
  readonly failed: number;
  /** Calls left under the monthly cap when the run started. */
  readonly capLeft: number;
  readonly dryRun: boolean;
  /** Set when the run ended before every place was read. */
  readonly stopped?: 'budget' | 'cap' | 'rate_limited';
}

const REQUEST_TIMEOUT_MS = 10_000;

interface PlaceToWarm {
  readonly id: string;
  readonly fsq_place_id: string;
}

/** Must-sees first, so a small budget goes to the places most likely to be shown. */
async function placesToWarm(pool: pg.Pool, slug: string | undefined): Promise<PlaceToWarm[]> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<PlaceToWarm>(
      `SELECT p.id, coalesce(p.source_ids->>'fsq_os', f.fsq_place_id) AS fsq_place_id
         FROM pois p
         JOIN destinations d ON d.id = p.destination_id
         LEFT JOIN poi_foursquare_ids f ON f.poi_id = p.id
        WHERE p.curation = 'editorial' AND p.status = 'active'
          AND coalesce(p.source_ids->>'fsq_os', f.fsq_place_id) IS NOT NULL
          AND ($1::text IS NULL OR d.slug = $1)
          AND NOT EXISTS (SELECT 1 FROM poi_foursquare_photo_reads r WHERE r.poi_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM poi_foursquare_photos s WHERE s.poi_id = p.id)
        ORDER BY coalesce(p.editorial -> 'must_see' = 'true'::jsonb, false) DESC, d.slug, p.id`,
      [slug ?? null],
    );
    return rows;
  });
}

async function callsLeftThisMonth(pool: pg.Pool, cap: number): Promise<number> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ used: number }>(
      `SELECT (details_calls + match_calls + search_calls)::int AS used
         FROM foursquare_api_usage WHERE month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')`,
    );
    return Math.max(0, cap - (rows[0]?.used ?? 0));
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

/** One photos-only Place Details call: the body on 200, null when Foursquare has no such place. */
async function fetchPhotos(
  fsqPlaceId: string,
  config: FoursquarePhotoWarmupConfig,
  signal: AbortSignal | undefined,
): Promise<{ status: number; body: unknown }> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const response = await (config.fetch ?? globalThis.fetch)(
    `${config.baseUrl ?? 'https://places-api.foursquare.com'}/places/${encodeURIComponent(fsqPlaceId)}?fields=${FOURSQUARE_PHOTO_FIELDS}`,
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'X-Places-Api-Version': config.apiVersion ?? '2025-06-17',
        Accept: 'application/json',
      },
      signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
    },
  );
  return { status: response.status, body: response.ok ? await response.json() : null };
}

export async function runFoursquarePhotoWarmup(
  pool: pg.Pool,
  config: FoursquarePhotoWarmupConfig,
  options: FoursquarePhotoWarmupOptions,
  logger: JobLogger,
): Promise<FoursquarePhotoWarmupReport> {
  const places = await placesToWarm(pool, options.destination);
  const capLeft = await callsLeftThisMonth(pool, config.monthlyCallCap);
  const dryRun = options.dryRun === true;
  let calls = 0;
  let placesWithPhotos = 0;
  let placesWithoutPhotos = 0;
  let photosKept = 0;
  let failed = 0;
  const report = (
    stopped?: FoursquarePhotoWarmupReport['stopped'],
  ): FoursquarePhotoWarmupReport => ({
    places: places.length,
    calls,
    placesWithPhotos,
    placesWithoutPhotos,
    photosKept,
    failed,
    capLeft,
    dryRun,
    ...(stopped === undefined ? {} : { stopped }),
  });

  if (dryRun) {
    calls = Math.min(places.length, options.maxCalls, capLeft);
    if (calls === places.length) return report();
    return report(capLeft < options.maxCalls ? 'cap' : 'budget');
  }

  for (const place of places) {
    options.signal?.throwIfAborted();
    if (calls >= options.maxCalls) return report('budget');
    if (!(await reserveCall(pool, config.monthlyCallCap))) {
      logger.warn(
        { cap: config.monthlyCallCap, remaining: places.length - calls },
        'foursquare monthly call cap reached: photo warm-up stopped',
      );
      return report('cap');
    }
    calls += 1;
    let answer: { status: number; body: unknown };
    try {
      answer = await fetchPhotos(place.fsq_place_id, config, options.signal);
    } catch (error) {
      options.signal?.throwIfAborted();
      failed += 1;
      logger.warn({ err: error, poiId: place.id }, 'foursquare place photos failed');
      continue;
    }
    if (answer.status === 429) {
      logger.warn({ poiId: place.id }, 'foursquare refused calls: photo warm-up stopped');
      return report('rate_limited');
    }
    // A place Foursquare no longer has is read as having no photos, so it is not paid for again.
    const photos = answer.status === 404 ? [] : foursquareStoredPhotos(answer.body);
    if (photos === null) {
      failed += 1;
      logger.warn({ poiId: place.id, status: answer.status }, 'foursquare place photos failed');
      continue;
    }
    await withSystem(pool, (tx) => replacePoiFoursquarePhotos(tx, place.id, photos));
    photosKept += photos.length;
    if (photos.length > 0) placesWithPhotos += 1;
    else placesWithoutPhotos += 1;
  }
  return report();
}
