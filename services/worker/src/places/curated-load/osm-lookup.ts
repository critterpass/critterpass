/**
 * The OpenStreetMap answer for a curated place no row of ours carries. Nominatim's public search
 * (`NOMINATIM_SEARCH_URL`) is asked for the place's English name, then its local name, inside a
 * box around the researcher's point (`NEAR_DEGREES`, bounded); a day trip or nature area is asked
 * once more inside a wider box (`WIDE_DEGREES`). A result is the place only when one of its names
 * passes the loader's name rules (`./match.ts`) and it lies within `ACCEPT_RADIUS_M` of the point
 * (`FAR_ACCEPT_RADIUS_M` for a day trip or nature area). A business (a hotel, a restaurant) must
 * share the place's words: a name that only looks alike ("Patong Beach Hotel") is not the place.
 * The name, point and address then come
 * from OpenStreetMap, never from the researcher's point.
 *
 * Nominatim's usage policy: at most one request a second (`createNominatimSearch` serialises its
 * requests and spaces them by `MIN_REQUEST_INTERVAL_MS`), a User-Agent naming the app and a contact
 * address, and answers kept so a repeated question is not asked again.
 */
import { classifyOsmTags, type OsmTags, type PoiCategory } from '@cp/domain';

import { haversineDistanceM, trigramSimilarity } from '../conflate';
import {
  chooseCuratedMatch,
  SIMILAR_RADIUS_M,
  type CuratedLead,
  type MatchCandidate,
} from './match';
import type { CuratedPlaceRow } from './rows';

export const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
export const NOMINATIM_USER_AGENT =
  'critterpass-curated-places/1.0 (https://critterpass.app; hello@critterpass.app)';
export const MIN_REQUEST_INTERVAL_MS = 1_100;
const REQUEST_TIMEOUT_MS = 20_000;
/** Answers kept per worker process; a re-run inside it asks nothing twice. */
const CACHE_LIMIT = 5_000;
const RESULTS = 5;

export const NEAR_DEGREES = 0.2;
export const WIDE_DEGREES = 1;
export const ACCEPT_RADIUS_M = 2_000;
export const FAR_ACCEPT_RADIUS_M = 10_000;

/** One result of Nominatim's `format=jsonv2` search with address, name and extra details. */
export interface NominatimResult {
  readonly osm_type: string;
  readonly osm_id: number;
  readonly lat: string;
  readonly lon: string;
  readonly category: string;
  readonly type: string;
  readonly name?: string | null;
  readonly address?: Readonly<Record<string, string>> | null;
  readonly namedetails?: Readonly<Record<string, string>> | null;
  readonly extratags?: Readonly<Record<string, string>> | null;
}

export interface NominatimQuery {
  readonly q: string;
  readonly lat: number;
  readonly lng: number;
  /** Half the side of the search box, in degrees. */
  readonly degrees: number;
}

export type NominatimSearch = (query: NominatimQuery) => Promise<readonly NominatimResult[]>;

export function nominatimUrl(query: NominatimQuery): string {
  const box = [
    query.lng - query.degrees,
    query.lat + query.degrees,
    query.lng + query.degrees,
    query.lat - query.degrees,
  ].map((value) => value.toFixed(4));
  const params = new URLSearchParams({
    q: query.q,
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    extratags: '1',
    viewbox: box.join(','),
    bounded: '1',
    limit: String(RESULTS),
    'accept-language': 'en',
  });
  return `${NOMINATIM_SEARCH_URL}?${params.toString()}`;
}

export interface NominatimSearchOptions {
  readonly fetcher?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/** A Nominatim search that keeps the usage policy: one request at a time, a second apart, cached. */
export function createNominatimSearch(options: NominatimSearchOptions = {}): NominatimSearch {
  const fetcher = options.fetcher ?? fetch;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const cache = new Map<string, readonly NominatimResult[]>();
  let last = -Infinity;
  let queue: Promise<unknown> = Promise.resolve();
  const ask = async (url: string): Promise<readonly NominatimResult[]> => {
    const cached = cache.get(url);
    if (cached !== undefined) return cached;
    const wait = last + MIN_REQUEST_INTERVAL_MS - now();
    if (wait > 0) await sleep(wait);
    last = now();
    const response = await fetcher(url, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`nominatim search answered ${response.status}`);
    const body = (await response.json()) as unknown;
    const results = Array.isArray(body) ? (body as NominatimResult[]) : [];
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(url, results);
    return results;
  };
  return (query) => {
    const run = queue.then(() => ask(nominatimUrl(query)));
    queue = run.catch(() => undefined);
    return run;
  };
}

/** A place OpenStreetMap carries, as a `pois` row takes it. */
export interface OsmPlace {
  /** `n<id>`, `w<id>` or `r<id>`: the `source_ids.osm` key, as the ingest writes it. */
  readonly sourceId: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: PoiCategory;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  readonly openingHours: string | null;
  readonly website: string | null;
  readonly phone: string | null;
  readonly distanceM: number;
}

const OSM_PREFIX: Readonly<Record<string, string>> = { node: 'n', way: 'w', relation: 'r' };

/** Name keys that hold the place's own name (old and historic names are left out). */
const NAME_KEY =
  /^(name|name:[a-z]{2,3}(-[A-Za-z]+)?|alt_name|official_name|int_name|short_name)$/u;

const clean = (value: string | null | undefined): string | null => {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
};

/** Every name a result goes by: its namedetails variants and its display name. */
export function resultNames(result: NominatimResult): string[] {
  const names = Object.entries(result.namedetails ?? {})
    .filter(([key]) => NAME_KEY.test(key))
    .flatMap(([, value]) => value.split(';'));
  return [...new Set([...names, result.name ?? ''].map(clean).filter((n) => n !== null))];
}

/** The address the result's parts make: house number and street, area, then town. */
export function addressFromParts(parts: Readonly<Record<string, string>> | null | undefined) {
  if (parts === null || parts === undefined) return null;
  const street = parts['road'] ?? parts['pedestrian'] ?? parts['footway'] ?? parts['square'];
  const line = street === undefined ? null : clean([parts['house_number'], street].join(' '));
  const area = parts['suburb'] ?? parts['quarter'] ?? parts['neighbourhood'] ?? parts['village'];
  const town =
    parts['city'] ?? parts['town'] ?? parts['municipality'] ?? parts['county'] ?? parts['state'];
  const lines = [line, clean(area), clean(town)].filter((part) => part !== null);
  const unique = lines.filter((part, index) => lines.indexOf(part) === index);
  return unique.length === 0 ? null : unique.join(', ');
}

/** Whether the curated line marks a place the researcher's point may be far from. */
export function farReaching(row: CuratedPlaceRow): boolean {
  if (row.category === 'nature') return true;
  const text = [row.subtype ?? '', row.name_en, row.why_go_en, row.getting_there].join(' ');
  return /\bday[- ]trips?\b/iu.test(text);
}

/**
 * The OSM place a result is, when it is the lead: a name passes the loader's name rules (the
 * nearly-same-text rule only for a sight within `SIMILAR_RADIUS_M`) and the point lies within `radiusM`.
 */
export function acceptResult(
  lead: CuratedLead,
  result: NominatimResult,
  plain: ReadonlySet<string>,
  radiusM: number,
): { readonly place: OsmPlace; readonly score: number } | null {
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  const prefix = OSM_PREFIX[result.osm_type];
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || prefix === undefined) return null;
  const distanceM = haversineDistanceM(lead, { lat, lng });
  if (distanceM > radiusM) return null;
  const details = result.namedetails ?? {};
  const own = clean(details['name']) ?? clean(result.name);
  if (own === null) return null;
  const tags: OsmTags = { ...result.extratags, name: own, [result.category]: result.type };
  const classified = classifyOsmTags(tags);
  const sourceId = `${prefix}${String(result.osm_id)}`;
  // Each name is weighed on its own, as if at the point: the distance is checked above.
  const candidates: MatchCandidate[] = resultNames(result).map((name, index) => ({
    id: `${sourceId}:${index}`,
    name,
    nameLocal: null,
    category: classified?.category ?? 'other',
    lat,
    lng,
    address: null,
    quality: 0,
    distanceM: 0,
    similarity:
      distanceM > SIMILAR_RADIUS_M || classified?.kind === 'hours_only'
        ? 0
        : Math.max(
            trigramSimilarity(name, lead.name),
            lead.localName === null ? 0 : trigramSimilarity(name, lead.localName),
          ),
  }));
  const verdict = chooseCuratedMatch(lead, candidates, plain);
  if (verdict.kind === 'none') return null;
  const english = clean(details['name:en']);
  const extra = result.extratags ?? {};
  return {
    score: verdict.score,
    place: {
      sourceId,
      name: english ?? own,
      nameLocal: english !== null && english !== own ? own : null,
      category: classified?.category ?? lead.category,
      lat,
      lng,
      address: addressFromParts(result.address),
      openingHours: clean(extra['opening_hours']),
      website: clean(extra['website'] ?? extra['contact:website']),
      phone: clean(extra['phone'] ?? extra['contact:phone']),
      distanceM,
    },
  };
}

export interface OsmLookup {
  readonly place: OsmPlace | null;
  readonly queries: number;
  /** The nearest result of a query that was not the place, for the report. */
  readonly nearestRejected: { readonly name: string; readonly distanceM: number } | null;
}

/** Asks Nominatim for one curated place (see the file header). */
export async function findOsmPlace(
  row: CuratedPlaceRow,
  plain: ReadonlySet<string>,
  search: NominatimSearch,
): Promise<OsmLookup> {
  const lead: CuratedLead = {
    name: row.name_en,
    localName: row.name_local ?? null,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
  };
  const far = farReaching(row);
  const radiusM = far ? FAR_ACCEPT_RADIUS_M : ACCEPT_RADIUS_M;
  // A bracket in the English name is an area or a note ("Sedlec Ossuary (Kutná Hora)").
  const bare = row.name_en.replace(/\s*\([^)]*\)\s*/gu, ' ').trim();
  const names = [...new Set([bare || row.name_en, clean(row.name_local)])].filter(
    (name): name is string => name !== null,
  );
  let queries = 0;
  let nearestRejected: OsmLookup['nearestRejected'] = null;
  for (const degrees of far ? [NEAR_DEGREES, WIDE_DEGREES] : [NEAR_DEGREES]) {
    for (const q of names) {
      const results = await search({ q, lat: row.lat, lng: row.lng, degrees });
      queries += 1;
      const accepted = results
        .map((result) => acceptResult(lead, result, plain, radiusM))
        .filter((found) => found !== null)
        .sort((a, b) => b.score - a.score || a.place.distanceM - b.place.distanceM);
      const best = accepted[0];
      if (best !== undefined) return { place: best.place, queries, nearestRejected };
      for (const result of results) {
        const distanceM = Math.round(
          haversineDistanceM(lead, { lat: Number(result.lat), lng: Number(result.lon) }),
        );
        if (nearestRejected === null || distanceM < nearestRejected.distanceM) {
          nearestRejected = { name: result.name ?? '', distanceM };
        }
      }
    }
  }
  return { place: null, queries, nearestRejected };
}
