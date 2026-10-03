/**
 * Links curated POIs to Foursquare so live place details can find them (docs/product-decisions.md
 * D24). Open data already carries `pois.source_ids.fsq_os` for most places; for curated POIs without
 * it, one Place Search call (name around the POI's point, Pro fields only) finds the candidates and
 * `pickFoursquareMatch` decides. Only the id and our confidence are stored, in
 * `poi_foursquare_ids` (never `source_ids`, which is the ingest key): Foursquare's terms allow
 * keeping `fsq_place_id` and nothing else. Every call is counted under the shared monthly cap first.
 */
import {
  FOURSQUARE_MATCH_RADIUS_M,
  pickFoursquareMatch,
  type FoursquareMatch,
  type FoursquareMatchCandidate,
} from '@cp/domain';
import { withSystem } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import type { JobLogger } from '../boss/define-job';

export interface FoursquareMatchConfig {
  readonly apiKey: string;
  readonly monthlyCallCap: number;
  readonly apiVersion?: string;
  readonly baseUrl?: string;
  readonly fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

/** A miss is searched again after this long (Foursquare adds places; names get fixed). */
const RETRY_MISS_DAYS = 90;
const REQUEST_TIMEOUT_MS = 10_000;
const SEARCH_LIMIT = 10;

const searchResponseSchema = z.object({
  results: z.array(
    z.object({ fsq_place_id: z.string(), name: z.string(), distance: z.number().nonnegative() }),
  ),
});

interface PoiToMatch {
  readonly id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly lat: number;
  readonly lng: number;
}

/** One Place Search call: candidates near the point by name. Throws on any non-200 answer. */
export async function searchFoursquareCandidates(
  poi: Pick<PoiToMatch, 'name' | 'lat' | 'lng'>,
  config: FoursquareMatchConfig,
  signal?: AbortSignal,
): Promise<FoursquareMatchCandidate[]> {
  const params = new URLSearchParams({
    query: poi.name,
    ll: `${poi.lat},${poi.lng}`,
    radius: String(FOURSQUARE_MATCH_RADIUS_M),
    limit: String(SEARCH_LIMIT),
    fields: 'fsq_place_id,name,distance',
  });
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const response = await (config.fetch ?? globalThis.fetch)(
    `${config.baseUrl ?? 'https://places-api.foursquare.com'}/places/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'X-Places-Api-Version': config.apiVersion ?? '2025-06-17',
        Accept: 'application/json',
      },
      signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
    },
  );
  if (!response.ok) throw new FoursquareHttpError(response.status);
  const body = searchResponseSchema.parse(await response.json());
  return body.results.map((result) => ({
    fsqPlaceId: result.fsq_place_id,
    name: result.name,
    distance: result.distance,
  }));
}

export class FoursquareHttpError extends Error {
  constructor(readonly status: number) {
    super(`foursquare place search ${status}`);
    this.name = 'FoursquareHttpError';
  }
}

export interface FoursquareMatchReport {
  readonly destinations: number;
  readonly searched: number;
  readonly matched: number;
  readonly missed: number;
  readonly failed: number;
  /** Set when the run stopped early: the monthly cap, or Foursquare refusing calls. */
  readonly stopped?: 'cap' | 'rate_limited';
}

async function poisToMatch(pool: pg.Pool, slug: string | undefined): Promise<PoiToMatch[]> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<PoiToMatch>(
      `SELECT p.id, p.name, p.name_local, p.lat, p.lng
       FROM pois p
       JOIN destinations d ON d.id = p.destination_id
       LEFT JOIN poi_foursquare_ids f ON f.poi_id = p.id
       WHERE p.curation = 'editorial' AND p.status = 'active'
         AND NOT (p.source_ids ? 'fsq_os')
         AND ($1::text IS NULL OR d.slug = $1)
         AND (f.poi_id IS NULL
              OR (f.fsq_place_id IS NULL AND f.matched_at < now() - make_interval(days => $2)))
       ORDER BY d.slug, p.id`,
      [slug ?? null, RETRY_MISS_DAYS],
    );
    return rows;
  });
}

async function recordMatch(
  pool: pg.Pool,
  poiId: string,
  match: FoursquareMatch | null,
): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO poi_foursquare_ids (poi_id, fsq_place_id, confidence, matched_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (poi_id) DO UPDATE SET
         fsq_place_id = EXCLUDED.fsq_place_id,
         confidence = EXCLUDED.confidence,
         matched_at = EXCLUDED.matched_at`,
      [poiId, match?.fsqPlaceId ?? null, match?.confidence ?? null],
    ),
  );
}

async function reserveMatchCall(pool: pg.Pool, cap: number): Promise<boolean> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ ok: boolean }>(
      "SELECT app.reserve_foursquare_call('match', $1) AS ok",
      [cap],
    );
    return rows[0]?.ok === true;
  });
}

/** Matches the curated POIs of one destination (or every destination) that still need an id. */
export async function runFoursquareMatch(
  pool: pg.Pool,
  config: FoursquareMatchConfig,
  options: { readonly destination?: string; readonly signal?: AbortSignal },
  logger: JobLogger,
): Promise<FoursquareMatchReport> {
  const pois = await poisToMatch(pool, options.destination);
  let searched = 0;
  let matched = 0;
  let missed = 0;
  let failed = 0;
  const report = (stopped?: 'cap' | 'rate_limited'): FoursquareMatchReport => ({
    destinations: options.destination === undefined ? 0 : 1,
    searched,
    matched,
    missed,
    failed,
    ...(stopped === undefined ? {} : { stopped }),
  });

  for (const poi of pois) {
    options.signal?.throwIfAborted();
    if (!(await reserveMatchCall(pool, config.monthlyCallCap))) {
      logger.warn(
        { cap: config.monthlyCallCap, remaining: pois.length - searched },
        'foursquare monthly call cap reached: id matching stopped',
      );
      return report('cap');
    }
    searched += 1;
    let candidates: FoursquareMatchCandidate[];
    try {
      candidates = await searchFoursquareCandidates(poi, config, options.signal);
    } catch (error) {
      if (error instanceof FoursquareHttpError && error.status === 429) {
        logger.warn({ poiId: poi.id }, 'foursquare refused calls: id matching stopped');
        return report('rate_limited');
      }
      options.signal?.throwIfAborted();
      failed += 1;
      logger.warn({ err: error, poiId: poi.id }, 'foursquare place search failed');
      continue;
    }
    const names = poi.name_local === null ? [poi.name] : [poi.name, poi.name_local];
    const match = pickFoursquareMatch(names, candidates);
    await recordMatch(pool, poi.id, match);
    if (match === null) missed += 1;
    else matched += 1;
  }
  return report();
}
