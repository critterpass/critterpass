/**
 * Wikidata (CC0) candidates: items of a destination type with an English or Vietnamese
 * Wikivoyage article and at least 10 sitelinks, with their coordinates, country, population,
 * image and Wikivoyage banner, GeoNames id, elevation and English and Vietnamese labels. Each type
 * is queried in sitelink bands so every page finishes well inside WDQS's 60 s limit, at most five
 * pages at once (WDQS's limit per client). A page is retried on 429 and 5xx, and on a truncated
 * body (WDQS cuts the JSON off mid-stream and appends a Java `TimeoutException` trailer).
 */
import type { BaseCandidate, DestinationKind } from '@cp/domain';

import { inPool, runQuery, type Binding, type WikidataOptions } from './wdqs';

export type { WikidataOptions } from './wdqs';

export const MIN_SITELINKS = 10;

/**
 * Wikidata class → our kind. "Geographic region" is left out: its items include continents,
 * macro-regions, conflict zones and planning corridors, none of which a crew can travel to.
 */
export const WIKIDATA_TYPES: Readonly<Record<string, DestinationKind>> = {
  Q515: 'city',
  Q1549591: 'city',
  Q3957: 'town',
  Q532: 'village',
  Q23442: 'island',
  Q46169: 'park',
};

/**
 * Sitelink bands `[from, to)` a type is paged by: each item has one sitelink count, so it lands in
 * exactly one page with all its rows (the query yields a row per value combination).
 */
export const SITELINK_BANDS: readonly (readonly [number, number | null])[] = [
  [MIN_SITELINKS, 12],
  [12, 15],
  [15, 20],
  [20, 30],
  [30, 50],
  [50, 100],
  [100, null],
];

export function candidateQuery(
  typeQid: string,
  band: readonly [number, number | null] = [MIN_SITELINKS, null],
): string {
  const [from, to] = band;
  const filter = `?sitelinks >= ${String(from)}${to === null ? '' : ` && ?sitelinks < ${String(to)}`}`;
  return `SELECT ?item ?sitelinks ?iso ?coord ?pop ?image ?banner ?gn ?en ?vi ?elev WHERE {
  VALUES ?site { <https://en.wikivoyage.org/> <https://vi.wikivoyage.org/> }
  ?item wdt:P31 wd:${typeQid} .
  ?wv schema:about ?item ; schema:isPartOf ?site .
  ?item wikibase:sitelinks ?sitelinks . FILTER(${filter})
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
  const results = await inPool(
    batches.map(
      (batch, index) => () =>
        runQuery(byGeonamesQuery(batch), `geonames ids page ${String(index + 1)}`, options),
    ),
    5,
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
  const pages = Object.entries(WIKIDATA_TYPES).flatMap(([qid, kind]) =>
    SITELINK_BANDS.map((band) => ({ qid, kind, band })),
  );
  const results = await inPool(
    pages.map(({ qid, kind, band }) => async () => {
      const label = `${qid} sitelinks ${String(band[0])}–${band[1] === null ? '' : String(band[1])}`;
      return candidatesFromBindings(
        await runQuery(candidateQuery(qid, band), label, options),
        kind,
      );
    }),
    5,
  );
  // An item of several types keeps its first (city before town before island …).
  const seen = new Set<string>();
  return results.flat().filter((row) => {
    if (row.qid === null || seen.has(row.qid)) return false;
    seen.add(row.qid);
    return true;
  });
}
