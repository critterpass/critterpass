/**
 * The OpenStreetMap fallback of `GET /v1/places/search` (docs/api-contracts.md §5.5): a submitted
 * search (`submit=1`) with a query inside a destination that our own index has no answer for asks
 * Nominatim once, bounded to the destination's place box. A result whose name passes the curated
 * name rules (`@cp/planner`) becomes one `pois` row, written as the ingest writes an OSM place
 * (`attachOsmPlace`), and the search answers again from our index.
 *
 * The public Nominatim instance allows at most one request a second, so the fallback never waits:
 * a Redis bucket of one request per second across every api instance, plus a daily cap
 * (`places.osm_fallback.daily_cap`); over either, the answer simply has no fallback. Answers,
 * found or not, are kept 30 days per destination and query. The kill switch is
 * `places.osm_fallback.enabled` (on unless switched off).
 */
import { createHash } from 'node:crypto';

import { attachOsmPlace, withSystem } from '@cp/db';
import { findOsmPlace, plainWords, type CuratedLead } from '@cp/planner';
import { fetchNominatim } from '@cp/suppliers';
import type pg from 'pg';

import { foldWord } from './search-destination';

export const OSM_FALLBACK_SWITCH = 'places.osm_fallback.enabled';
export const OSM_FALLBACK_DAILY_CAP_KEY = 'places.osm_fallback.daily_cap';
export const DEFAULT_OSM_FALLBACK_DAILY_CAP = 1_000;
export const MIN_FALLBACK_QUERY_LENGTH = 3;
export const FALLBACK_CACHE_SECONDS = 30 * 24 * 3_600;
const CAP_CACHE_MS = 60_000;
const NOT_FOUND = 'none';

export interface OsmFallbackRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

export interface OsmFallbackDeps {
  readonly redis: OsmFallbackRedis;
  readonly isOn: (key: string) => Promise<boolean>;
  readonly fetcher?: typeof fetch;
  readonly now?: () => Date;
  readonly onError?: (error: unknown) => void;
}

export type OsmFallbackOutcome =
  | 'switched_off'
  | 'no_box'
  | 'cached_none'
  | 'cached'
  | 'limited'
  | 'capped'
  | 'failed'
  | 'none'
  | 'found';

/** The query as the cache keys it: folded, single-spaced. */
export function normaliseFallbackQuery(q: string): string {
  return q.trim().split(/\s+/u).map(foldWord).join(' ');
}

const cacheKey = (destinationId: string, q: string) =>
  `places:osm:answer:${destinationId}:${createHash('sha256').update(normaliseFallbackQuery(q)).digest('hex')}`;

/** One count per window key; true while the window's count stays within `max`. */
async function take(redis: OsmFallbackRedis, key: string, seconds: number, max: number) {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, seconds);
  return count <= max;
}

let capCache: { at: number; cap: number } | null = null;

async function dailyCap(pool: pg.Pool, now: number): Promise<number> {
  if (capCache !== null && now - capCache.at < CAP_CACHE_MS) return capCache.cap;
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ value: unknown }>('SELECT value FROM ops.ops_config WHERE key = $1', [
      OSM_FALLBACK_DAILY_CAP_KEY,
    ]),
  );
  const value = rows[0]?.value;
  const cap = typeof value === 'number' ? value : DEFAULT_OSM_FALLBACK_DAILY_CAP;
  capCache = { at: now, cap };
  return cap;
}

/** Looks the query up in OpenStreetMap and stores the place it finds (see the file header). */
export async function osmFallback(
  pool: pg.Pool,
  deps: OsmFallbackDeps,
  input: { readonly destinationId: string; readonly q: string },
): Promise<OsmFallbackOutcome> {
  if (!(await deps.isOn(OSM_FALLBACK_SWITCH))) return 'switched_off';
  const key = cacheKey(input.destinationId, input.q);
  const cached = await deps.redis.get(key);
  if (cached === NOT_FOUND) return 'cached_none';
  if (cached !== null) return 'cached';
  const destination = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      name: string;
      country: string | null;
      min_lat: number;
      min_lng: number;
      max_lat: number;
      max_lng: number;
    }>(
      `SELECT name, country, ST_YMin(place_bounds::geometry) AS min_lat,
              ST_XMin(place_bounds::geometry) AS min_lng, ST_YMax(place_bounds::geometry) AS max_lat,
              ST_XMax(place_bounds::geometry) AS max_lng
         FROM destinations WHERE id = $1 AND place_bounds IS NOT NULL`,
      [input.destinationId],
    );
    return rows[0];
  });
  if (destination === undefined) return 'no_box';
  const now = (deps.now ?? (() => new Date()))();
  const second = Math.floor(now.getTime() / 1_000);
  if (!(await take(deps.redis, `places:osm:second:${second}`, 2, 1))) return 'limited';
  const day = now.toISOString().slice(0, 10);
  const cap = await dailyCap(pool, now.getTime());
  if (!(await take(deps.redis, `places:osm:day:${day}`, 2 * 86_400, cap))) return 'capped';
  const box = {
    minLat: destination.min_lat,
    minLng: destination.min_lng,
    maxLat: destination.max_lat,
    maxLng: destination.max_lng,
  };
  const lead: CuratedLead = {
    name: input.q.trim(),
    localName: null,
    category: 'other',
    lat: (box.minLat + box.maxLat) / 2,
    lng: (box.minLng + box.maxLng) / 2,
  };
  let lookup;
  try {
    const results = await fetchNominatim({ q: lead.name, box }, deps.fetcher);
    // The box bounds the answer, so no distance from the box's centre is asked for.
    lookup = await findOsmPlace(
      lead,
      [{ q: lead.name, box }],
      plainWords(destination.name, destination.country),
      null,
      () => Promise.resolve(results),
    );
  } catch (error) {
    deps.onError?.(error);
    return 'failed';
  }
  const place = lookup.place;
  if (place === null) {
    await deps.redis.set(key, NOT_FOUND, { EX: FALLBACK_CACHE_SECONDS });
    return 'none';
  }
  const attached = await withSystem(pool, (tx) => attachOsmPlace(tx, input.destinationId, place));
  // A row another destination owns inside an overlapping box is still answered by the search.
  await deps.redis.set(key, attached?.id ?? place.sourceId, { EX: FALLBACK_CACHE_SECONDS });
  return 'found';
}
