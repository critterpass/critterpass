/**
 * Read-through cache of routed travel minutes (`route_cache`, server only, kept 30 days): the
 * legs job, the plan check and fit ask for the same stop pairs again and again. Only Valhalla
 * answers are cached; a straight-line estimate is cheaper to recompute than to look up, and
 * caching it would hide the router's answer once it is back. Valhalla runs free-flow, so the key
 * is the two points (rounded to 5 decimals, about a metre) and the mode, with no hour.
 */
export interface CachedTravel {
  readonly minutes: number;
  readonly meters: number;
}

export interface RouteCache {
  get(keys: readonly string[]): Promise<Map<string, CachedTravel>>;
  put(entries: readonly (CachedTravel & { readonly key: string })[]): Promise<void>;
}

/** Runs one statement as the system role; a `pg` client's `query` fits. */
export type RouteCacheQuery = (
  sql: string,
  params: readonly unknown[],
) => Promise<{ readonly rows: readonly unknown[] }>;

export const ROUTE_CACHE_TTL_DAYS = 30;

const fixed = (value: number) => value.toFixed(5);

export function routeCacheKey(
  from: { readonly lat: number; readonly lng: number },
  to: { readonly lat: number; readonly lng: number },
  mode: string,
): string {
  return `${mode}:${fixed(from.lat)},${fixed(from.lng)}:${fixed(to.lat)},${fixed(to.lng)}`;
}

interface CacheRow {
  readonly key: string;
  readonly minutes: number;
  readonly meters: number;
}

export function createSqlRouteCache(query: RouteCacheQuery): RouteCache {
  return {
    async get(keys) {
      if (keys.length === 0) return new Map();
      const { rows } = await query(
        `SELECT key, minutes, meters FROM route_cache
          WHERE key = ANY($1::text[]) AND source = 'valhalla'
            AND computed_at > now() - make_interval(days => $2)`,
        [[...new Set(keys)], ROUTE_CACHE_TTL_DAYS],
      );
      return new Map(
        (rows as CacheRow[]).map((row) => [row.key, { minutes: row.minutes, meters: row.meters }]),
      );
    },
    async put(entries) {
      const unique = [...new Map(entries.map((entry) => [entry.key, entry])).values()];
      if (unique.length === 0) return;
      await query(
        `INSERT INTO route_cache (key, minutes, meters, source)
         SELECT key, minutes, meters, 'valhalla'
           FROM unnest($1::text[], $2::int[], $3::int[]) AS fresh(key, minutes, meters)
         ON CONFLICT (key) DO UPDATE
           SET minutes = EXCLUDED.minutes, meters = EXCLUDED.meters,
               source = EXCLUDED.source, computed_at = now()`,
        [
          unique.map((entry) => entry.key),
          unique.map((entry) => entry.minutes),
          unique.map((entry) => entry.meters),
        ],
      );
    },
  };
}
