/**
 * Wikidata (CC0) candidates: items of a destination type with an English or Vietnamese
 * Wikivoyage article and at least 10 sitelinks, with their coordinates, country, population,
 * image and Wikivoyage banner, GeoNames id, elevation and English and Vietnamese labels. One SPARQL
 * query per type, at most five at once (WDQS's limit per client), retried on 429 and 5xx.
 */
import type { BaseCandidate, DestinationKind } from '@cp/domain';

export const WDQS_URL = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'CritterPass-destinations/1.0 (https://critterpass.app; ops@critterpass.app)';
export const MIN_SITELINKS = 10;

/** Wikidata class → our kind. */
export const WIKIDATA_TYPES: Readonly<Record<string, DestinationKind>> = {
  Q515: 'city',
  Q1549591: 'city',
  Q3957: 'town',
  Q532: 'village',
  Q23442: 'island',
  Q46169: 'park',
  Q82794: 'region',
};

export function candidateQuery(typeQid: string): string {
  return `SELECT ?item ?sitelinks ?iso ?coord ?pop ?image ?banner ?gn ?en ?vi ?elev WHERE {
  VALUES ?site { <https://en.wikivoyage.org/> <https://vi.wikivoyage.org/> }
  ?item wdt:P31 wd:${typeQid} .
  ?wv schema:about ?item ; schema:isPartOf ?site .
  ?item wikibase:sitelinks ?sitelinks . FILTER(?sitelinks >= ${MIN_SITELINKS})
  ?item wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P17/wdt:P297 ?iso }
  OPTIONAL { ?item wdt:P1082 ?pop }
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P948 ?banner }
  OPTIONAL { ?item wdt:P1566 ?gn }
  OPTIONAL { ?item wdt:P2044 ?elev }
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?vi FILTER(lang(?vi) = "vi") }
}`;
}

type Binding = Partial<Record<string, { value: string }>>;

/** `…/Special:FilePath/Hoi%20An.jpg` → `Hoi An.jpg`. */
export function commonsFileName(url: string): string | null {
  const at = url.lastIndexOf('/Special:FilePath/');
  if (at < 0) return null;
  return decodeURIComponent(url.slice(at + '/Special:FilePath/'.length)).replace(/_/gu, ' ');
}

const POINT = /^Point\(([-\d.eE]+) ([-\d.eE]+)\)$/u;

/** Folds a query's rows (one per value combination) into one candidate per item. */
export function candidatesFromBindings(
  bindings: readonly Binding[],
  kind: DestinationKind,
): BaseCandidate[] {
  const byItem = new Map<string, Binding[]>();
  for (const row of bindings) {
    const item = row['item']?.value;
    if (item === undefined) continue;
    byItem.set(item, [...(byItem.get(item) ?? []), row]);
  }
  const out: BaseCandidate[] = [];
  for (const [item, rows] of byItem) {
    const first = (key: string) => rows.find((row) => row[key] !== undefined)?.[key]?.value;
    const point = POINT.exec(first('coord') ?? '');
    const iso = first('iso');
    const en = first('en');
    const vi = first('vi');
    if (point === null || iso === undefined || !/^[A-Z]{2}$/u.test(iso)) continue;
    const name = iso === 'VN' ? (vi ?? en) : (en ?? vi);
    if (name === undefined) continue;
    const pops = rows.flatMap((row) => {
      const value = Number(row['pop']?.value);
      return Number.isFinite(value) && value > 0 ? [Math.round(value)] : [];
    });
    const gn = Number(first('gn'));
    const elevation = Number(first('elev'));
    const banner = first('banner');
    const image = first('image');
    out.push({
      qid: item.slice(item.lastIndexOf('/') + 1),
      geonamesId: Number.isInteger(gn) && gn > 0 ? gn : null,
      name,
      names: { ...(en === undefined ? {} : { en }), ...(vi === undefined ? {} : { vi }) },
      countryCode: iso,
      admin1: null,
      kind,
      lat: Number(point[2]),
      lng: Number(point[1]),
      population: pops.length === 0 ? null : Math.max(...pops),
      sitelinks: Number(first('sitelinks') ?? 0),
      photoFile: commonsFileName(banner ?? image ?? ''),
      elevationM: Number.isFinite(elevation) ? Math.round(elevation) : null,
    });
  }
  return out;
}

export interface WikidataOptions {
  readonly fetch?: typeof fetch;
  readonly retries?: number;
  readonly retryDelayMs?: number;
}

async function runQuery(query: string, options: WikidataOptions): Promise<Binding[]> {
  const fetchImpl = options.fetch ?? fetch;
  const retries = options.retries ?? 4;
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetchImpl(WDQS_URL, {
      method: 'POST',
      headers: {
        accept: 'application/sparql-results+json',
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': USER_AGENT,
      },
      body: new URLSearchParams({ query }).toString(),
      signal: AbortSignal.timeout(90_000),
    });
    if (response.ok) {
      const body = (await response.json()) as { results?: { bindings?: Binding[] } };
      return body.results?.bindings ?? [];
    }
    if ((response.status !== 429 && response.status < 500) || attempt >= retries) {
      throw new Error(`Wikidata query failed: HTTP ${response.status}`);
    }
    const wait = Number(response.headers.get('retry-after'));
    const delay =
      Number.isFinite(wait) && wait > 0
        ? wait * 1000
        : (options.retryDelayMs ?? 5_000) * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/** GeoNames ids per query when looking cities up by their GeoNames id (Wikidata P1566). */
export const GEONAMES_IDS_PER_QUERY = 400;

export function byGeonamesQuery(ids: readonly number[]): string {
  return `SELECT ?item ?gn ?sitelinks ?image ?banner ?en ?vi WHERE {
  VALUES ?gn { ${ids.map((id) => `"${String(id)}"`).join(' ')} }
  ?item wdt:P1566 ?gn ; wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P948 ?banner }
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?vi FILTER(lang(?vi) = "vi") }
}`;
}

export interface WikidataFame {
  readonly qid: string;
  readonly sitelinks: number;
  readonly photoFile: string | null;
  readonly en?: string;
  readonly vi?: string;
}

/**
 * Fame and photo of GeoNames cities by their GeoNames id: a city whose Wikidata class is a
 * subclass (a "city of the United States") is missed by the typed query, and without its
 * sitelinks it would rank as unknown.
 */
export async function loadWikidataByGeonames(
  ids: readonly number[],
  options: WikidataOptions = {},
): Promise<Map<number, WikidataFame>> {
  const fame = new Map<number, WikidataFame>();
  const batches: number[][] = [];
  for (let at = 0; at < ids.length; at += GEONAMES_IDS_PER_QUERY) {
    batches.push(ids.slice(at, at + GEONAMES_IDS_PER_QUERY));
  }
  for (let at = 0; at < batches.length; at += 5) {
    const results = await Promise.all(
      batches.slice(at, at + 5).map((batch) => runQuery(byGeonamesQuery(batch), options)),
    );
    for (const row of results.flat()) {
      const item = row['item']?.value;
      const gn = Number(row['gn']?.value);
      if (item === undefined || !Number.isInteger(gn)) continue;
      const sitelinks = Number(row['sitelinks']?.value ?? 0);
      const known = fame.get(gn);
      if (known !== undefined && known.sitelinks >= sitelinks) continue;
      const en = row['en']?.value;
      const vi = row['vi']?.value;
      fame.set(gn, {
        qid: item.slice(item.lastIndexOf('/') + 1),
        sitelinks,
        photoFile: commonsFileName(row['banner']?.value ?? row['image']?.value ?? ''),
        ...(en === undefined ? {} : { en }),
        ...(vi === undefined ? {} : { vi }),
      });
    }
  }
  return fame;
}

/** GeoNames cities with their Wikidata id, sitelinks, photo and labels where Wikidata has them. */
export function withFame(
  cities: readonly BaseCandidate[],
  fame: ReadonlyMap<number, WikidataFame>,
): BaseCandidate[] {
  return cities.map((city) => {
    const found = city.geonamesId === null ? undefined : fame.get(city.geonamesId);
    if (found === undefined) return city;
    return {
      ...city,
      qid: city.qid ?? found.qid,
      sitelinks: found.sitelinks,
      photoFile: found.photoFile,
      names: {
        ...city.names,
        ...(found.en === undefined ? {} : { en: found.en }),
        ...(found.vi === undefined ? {} : { vi: found.vi }),
      },
      name: city.countryCode === 'VN' ? (found.vi ?? city.name) : (found.en ?? city.name),
    };
  });
}

export async function loadWikidataCandidates(
  options: WikidataOptions = {},
): Promise<BaseCandidate[]> {
  const types = Object.entries(WIKIDATA_TYPES);
  const results: BaseCandidate[][] = [];
  for (let at = 0; at < types.length; at += 5) {
    const batch = types.slice(at, at + 5);
    results.push(
      ...(await Promise.all(
        batch.map(async ([qid, kind]) =>
          candidatesFromBindings(await runQuery(candidateQuery(qid), options), kind),
        ),
      )),
    );
  }
  // An item of several types keeps its first (city before town before island …).
  const seen = new Set<string>();
  return results.flat().filter((row) => {
    if (row.qid === null || seen.has(row.qid)) return false;
    seen.add(row.qid);
    return true;
  });
}
