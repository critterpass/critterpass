/**
 * Nominatim's public search (`format=jsonv2`, with address parts, every name and extra tags),
 * bounded to a box, and its lookup of one OpenStreetMap element by id (the same reply shape). The public instance's usage policy is strict and part of the contract here:
 * at most one request a second across the whole app, a User-Agent naming the app with a contact
 * address, answers kept so the same question is not asked twice, and backing off when refused. A
 * caller supplies the pacing (`createNominatimSearch` paces one process; the api's fallback shares a
 * Redis bucket).
 */
import type { NominatimBox, NominatimQuery, NominatimResult } from '@cp/domain';

export type { NominatimBox, NominatimQuery, NominatimResult };

export const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
export const NOMINATIM_LOOKUP_URL = 'https://nominatim.openstreetmap.org/lookup';
export const NOMINATIM_USER_AGENT =
  'critterpass-places/1.0 (https://critterpass.app; hello@critterpass.app)';
export const MIN_REQUEST_INTERVAL_MS = 1_100;
/** The first pause after a refused (429) or failing (5xx) answer; doubled per refusal in a row. */
export const REFUSED_BACKOFF_MS = 60_000;
export const MAX_BACKOFF_MS = 15 * 60_000;
/** Tries of one question before the paced search gives up and throws (waits 1, 2 then 4 minutes). */
export const REFUSED_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 10_000;
const RESULTS = 5;
/** Answers one paced search keeps in memory. */
const CACHE_LIMIT = 5_000;

export type NominatimSearch = (query: NominatimQuery) => Promise<readonly NominatimResult[]>;
/** One element by its id (`node/<id>`, `way/<id>` or `relation/<id>`), or null when it is gone. */
export type NominatimLookup = (osm: string) => Promise<NominatimResult | null>;
/** A paced search that also looks elements up by id, both through the same turns and cache. */
export type NominatimClient = NominatimSearch & { readonly lookup: NominatimLookup };

const OSM_ELEMENT = /^(node|way|relation)\/([1-9]\d*)$/u;

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

/** The lookup URL of one element (`node/<id>`, `way/<id>`, `relation/<id>`); throws on any other. */
export function nominatimLookupUrl(osm: string): string {
  const element = OSM_ELEMENT.exec(osm);
  if (element === null) throw new Error(`not an OpenStreetMap element: ${osm}`);
  const [, type = '', id = ''] = element;
  const params = new URLSearchParams({
    osm_ids: `${type.charAt(0).toUpperCase()}${id}`,
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    extratags: '1',
    'accept-language': 'en',
  });
  return `${NOMINATIM_LOOKUP_URL}?${params.toString()}`;
}

/** A 429 or 5xx answer: the instance asks us to slow down, `retryAfterMs` when it said how long. */
export class NominatimRefusedError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(`nominatim search answered ${status}`);
    this.name = 'NominatimRefusedError';
  }
}

function retryAfterMs(header: string | null): number | null {
  if (header === null) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : null;
}

/**
 * One request, unpaced: the caller has taken its turn. Throws `NominatimRefusedError` on a 429 or
 * 5xx answer and a plain error on any other failed request.
 */
export async function fetchNominatim(
  query: NominatimQuery | string,
  fetcher: typeof fetch = fetch,
): Promise<readonly NominatimResult[]> {
  const url = typeof query === 'string' ? query : nominatimUrl(query);
  const response = await fetcher(url, {
    headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 429 || response.status >= 500) {
    throw new NominatimRefusedError(
      response.status,
      retryAfterMs(response.headers.get('Retry-After')),
    );
  }
  if (!response.ok) throw new Error(`nominatim search answered ${response.status}`);
  const body = (await response.json()) as unknown;
  return Array.isArray(body) ? (body as NominatimResult[]) : [];
}

export interface PacedSearchOptions {
  readonly fetcher?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/**
 * A search for one process (with `lookup` by element id): one request at a time, `MIN_REQUEST_INTERVAL_MS` apart, cached. A
 * refused or failing answer pauses every later request too, for `REFUSED_BACKOFF_MS` doubled per
 * refusal in a row (at most `MAX_BACKOFF_MS`, at least the answer's `Retry-After`), and asks the
 * same question again up to `REFUSED_ATTEMPTS` times before throwing; an answer resets the pause.
 */
export function createNominatimSearch(options: PacedSearchOptions = {}): NominatimClient {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const cache = new Map<string, readonly NominatimResult[]>();
  let next = -Infinity;
  let refusals = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const turn = async (url: string): Promise<readonly NominatimResult[]> => {
    const wait = next - now();
    if (wait > 0) await sleep(wait);
    next = now() + MIN_REQUEST_INTERVAL_MS;
    try {
      const results = await fetchNominatim(url, options.fetcher);
      refusals = 0;
      return results;
    } catch (error) {
      if (!(error instanceof NominatimRefusedError)) throw error;
      const backoff = Math.min(REFUSED_BACKOFF_MS * 2 ** refusals, MAX_BACKOFF_MS);
      refusals += 1;
      next = now() + Math.max(backoff, error.retryAfterMs ?? 0);
      throw error;
    }
  };
  const ask = async (key: string): Promise<readonly NominatimResult[]> => {
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    for (let attempt = 1; ; attempt += 1) {
      try {
        const results = await turn(key);
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
        cache.set(key, results);
        return results;
      } catch (error) {
        if (!(error instanceof NominatimRefusedError) || attempt >= REFUSED_ATTEMPTS) throw error;
      }
    }
  };
  const paced = (url: string): Promise<readonly NominatimResult[]> => {
    const run = queue.then(() => ask(url));
    queue = run.catch(() => undefined);
    return run;
  };
  const search = (query: NominatimQuery) => paced(nominatimUrl(query));
  const lookup: NominatimLookup = async (osm) => (await paced(nominatimLookupUrl(osm)))[0] ?? null;
  return Object.assign(search, { lookup });
}
