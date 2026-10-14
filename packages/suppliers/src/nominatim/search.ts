/**
 * Nominatim's public search (`format=jsonv2`, with address parts, every name and extra tags),
 * bounded to a box. The public instance's usage policy is strict and part of the contract here:
 * at most one request a second across the whole app, a User-Agent naming the app with a contact
 * address, and answers kept so the same question is not asked twice. A caller supplies the pacing
 * (`createNominatimSearch` paces one process; the api's fallback shares a Redis bucket).
 */
import type { NominatimBox, NominatimQuery, NominatimResult } from '@cp/domain';

export type { NominatimBox, NominatimQuery, NominatimResult };

export const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
export const NOMINATIM_USER_AGENT =
  'critterpass-places/1.0 (https://critterpass.app; hello@critterpass.app)';
export const MIN_REQUEST_INTERVAL_MS = 1_100;
const REQUEST_TIMEOUT_MS = 10_000;
const RESULTS = 5;
/** Answers one paced search keeps in memory. */
const CACHE_LIMIT = 5_000;

export type NominatimSearch = (query: NominatimQuery) => Promise<readonly NominatimResult[]>;

/** The box `degrees` either side of a point. */
export function boxAround(lat: number, lng: number, degrees: number): NominatimBox {
  return {
    minLat: lat - degrees,
    minLng: lng - degrees,
    maxLat: lat + degrees,
    maxLng: lng + degrees,
  };
}

export function nominatimUrl(query: NominatimQuery): string {
  const { box } = query;
  const viewbox = [box.minLng, box.maxLat, box.maxLng, box.minLat].map((v) => v.toFixed(4));
  const params = new URLSearchParams({
    q: query.q,
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    extratags: '1',
    viewbox: viewbox.join(','),
    bounded: '1',
    limit: String(RESULTS),
    'accept-language': 'en',
  });
  return `${NOMINATIM_SEARCH_URL}?${params.toString()}`;
}

/** One request, unpaced: the caller has taken its turn. Throws on a refused or failed request. */
export async function fetchNominatim(
  query: NominatimQuery,
  fetcher: typeof fetch = fetch,
): Promise<readonly NominatimResult[]> {
  const response = await fetcher(nominatimUrl(query), {
    headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`nominatim search answered ${response.status}`);
  const body = (await response.json()) as unknown;
  return Array.isArray(body) ? (body as NominatimResult[]) : [];
}

export interface PacedSearchOptions {
  readonly fetcher?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/** A search for one process: one request at a time, `MIN_REQUEST_INTERVAL_MS` apart, cached. */
export function createNominatimSearch(options: PacedSearchOptions = {}): NominatimSearch {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const cache = new Map<string, readonly NominatimResult[]>();
  let last = -Infinity;
  let queue: Promise<unknown> = Promise.resolve();
  const ask = async (query: NominatimQuery): Promise<readonly NominatimResult[]> => {
    const key = nominatimUrl(query);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const wait = last + MIN_REQUEST_INTERVAL_MS - now();
    if (wait > 0) await sleep(wait);
    last = now();
    const results = await fetchNominatim(query, options.fetcher);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(key, results);
    return results;
  };
  return (query) => {
    const run = queue.then(() => ask(query));
    queue = run.catch(() => undefined);
    return run;
  };
}
