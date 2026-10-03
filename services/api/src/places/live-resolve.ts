/**
 * `GET /v1/places/search/live/resolve` (docs/api-contracts.md §5.5; docs/product-decisions.md D25):
 * makes a picked live Foursquare result storable. Foursquare's terms let us keep its
 * `fsq_place_id` and nothing else, so what gets saved (as a must-do, in a plan) is always one of
 * our own POIs, built from open data:
 *
 * 1. the POI open data already links to that id (FSQ OS Places shares Foursquare's ids);
 * 2. else our open-data POI at the same spot with the same name (Overture or OpenStreetMap), found
 *    with the name and point one Pro-field Place Details call returns (counted under the monthly
 *    cap); they are used for this one match and never stored, and the match keeps only the id
 *    (`poi_foursquare_ids`);
 * 3. else, when the destination's open data is still sparse, its ingest is queued and the answer
 *    is `loading` (try again shortly); otherwise `unavailable`: the place can be viewed, not saved.
 */
import { FOURSQUARE_MATCH_FLOOR, nameSimilarity } from '@cp/domain';
import { withSystem } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import type { FoursquareLiveConfig } from './live';
import { queueIngestWhenSparse } from './on-demand-ingest';

/** Open data and Foursquare place the same building up to this far apart. */
const MATCH_RADIUS_M = 150;
const MATCH_CANDIDATES = 20;
const DEFAULT_API_VERSION = '2025-06-17';
const DEFAULT_BASE_URL = 'https://places-api.foursquare.com';
const DEFAULT_TIMEOUT_MS = 2_500;

export const liveResolveQuerySchema = z.object({
  fsq_place_id: z.string().regex(/^[0-9a-zA-Z]{1,64}$/),
  destination_id: z.uuid(),
});

export interface LiveResolveInput {
  readonly fsqPlaceId: string;
  readonly destinationId: string;
}

export type LiveResolveResult =
  | { readonly status: 'ready'; readonly poiId: string; readonly name: string }
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable' };

interface Candidate {
  readonly id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly distance_m: number;
}

interface FoursquarePoint {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

async function linkedPoi(
  tx: pg.PoolClient,
  fsqPlaceId: string,
): Promise<{ id: string; name: string } | null> {
  const { rows } = await tx.query<{ id: string; name: string }>(
    `SELECT p.id, p.name FROM pois p LEFT JOIN poi_foursquare_ids f ON f.poi_id = p.id
     WHERE (p.source_ids->>'fsq_os' = $1 OR f.fsq_place_id = $1)
       AND p.status = 'active' AND p.merged_into_id IS NULL
     ORDER BY (p.source_ids->>'fsq_os' = $1) DESC NULLS LAST, p.id
     LIMIT 1`,
    [fsqPlaceId],
  );
  return rows[0] ?? null;
}

/** The same-named open-data POI nearest the point; ties go to the closer one. */
export function pickSamePlace(name: string, candidates: readonly Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const ours =
      candidate.name_local === null ? [candidate.name] : [candidate.name, candidate.name_local];
    const score = nameSimilarity(ours, name);
    if (score < FOURSQUARE_MATCH_FLOOR) continue;
    if (
      best === null ||
      score > bestScore ||
      (score === bestScore && candidate.distance_m < best.distance_m)
    ) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

async function samePlace(tx: pg.PoolClient, point: FoursquarePoint): Promise<Candidate | null> {
  const { rows } = await tx.query<Candidate>(
    `SELECT p.id, p.name, p.name_local,
            ST_Distance(p.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_m
     FROM pois p
     LEFT JOIN poi_foursquare_ids f ON f.poi_id = p.id
     WHERE p.status = 'active' AND p.merged_into_id IS NULL
       AND f.fsq_place_id IS NULL AND NOT (p.source_ids ? 'fsq_os')
       AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
     ORDER BY distance_m
     LIMIT $4`,
    [point.lng, point.lat, MATCH_RADIUS_M, MATCH_CANDIDATES],
  );
  return pickSamePlace(point.name, rows);
}

const pointSchema = z.object({
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/** One counted Pro-field Place Details call; null on the cap, an error or a timeout. */
async function foursquarePoint(
  pool: pg.Pool,
  fsqPlaceId: string,
  config: FoursquareLiveConfig,
): Promise<FoursquarePoint | null> {
  const reserved = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ ok: boolean }>(
      "SELECT app.reserve_foursquare_call('details', $1) AS ok",
      [config.monthlyCallCap],
    );
    return rows[0]?.ok === true;
  });
  if (!reserved) {
    config.onCapReached?.(`resolve:${fsqPlaceId}`);
    return null;
  }
  try {
    const response = await (config.fetch ?? globalThis.fetch)(
      `${config.baseUrl ?? DEFAULT_BASE_URL}/places/${encodeURIComponent(fsqPlaceId)}?fields=name,latitude,longitude`,
      {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'X-Places-Api-Version': config.apiVersion ?? DEFAULT_API_VERSION,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      },
    );
    if (!response.ok) throw new Error(`foursquare place details ${response.status}`);
    const parsed = pointSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return { name: parsed.data.name, lat: parsed.data.latitude, lng: parsed.data.longitude };
  } catch (error) {
    config.onError?.(`resolve:${fsqPlaceId}`, error);
    return null;
  }
}

export async function resolveLivePlace(
  pool: pg.Pool,
  input: LiveResolveInput,
  config: FoursquareLiveConfig | undefined,
): Promise<LiveResolveResult> {
  const linked = await withSystem(pool, (tx) => linkedPoi(tx, input.fsqPlaceId));
  if (linked !== null) return { status: 'ready', poiId: linked.id, name: linked.name };

  const point = config === undefined ? null : await foursquarePoint(pool, input.fsqPlaceId, config);
  return withSystem(pool, async (tx) => {
    const match = point === null ? null : await samePlace(tx, point);
    if (match !== null) {
      // Only the id is kept; a curated match already on the POI is never replaced.
      await tx.query(
        `INSERT INTO poi_foursquare_ids (poi_id, fsq_place_id, confidence, matched_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (poi_id) DO UPDATE SET
           fsq_place_id = EXCLUDED.fsq_place_id,
           confidence = EXCLUDED.confidence,
           matched_at = EXCLUDED.matched_at
         WHERE poi_foursquare_ids.fsq_place_id IS NULL`,
        [match.id, input.fsqPlaceId, FOURSQUARE_MATCH_FLOOR],
      );
      return { status: 'ready', poiId: match.id, name: match.name };
    }
    const sparse = await queueIngestWhenSparse(tx, input.destinationId);
    return sparse ? { status: 'loading' } : { status: 'unavailable' };
  });
}
