/**
 * Wikidata (CC0) candidates: every item with an English or Vietnamese Wikivoyage article, at
 * least 10 sitelinks (5 in Vietnam, whose small destinations are thinly linked) and coordinates,
 * with its classes, Wikivoyage titles, country, population, image and Wikivoyage banner, GeoNames
 * id, elevation, English and Vietnamese labels, and the number of Wikivoyage editions covering it
 * (a travel signal that sitelinks alone miss: Kotor has 7, the Barcelona suburb L'Hospitalet 4).
 * `classes.ts` then decides from the classes which items are destinations and of what kind.
 * Queries are paged in sitelink bands so every page finishes well inside WDQS's 60 s limit, at most
 * five pages at once (WDQS's limit per client). A page is retried on 429 and 5xx, and on a
 * truncated body (WDQS cuts the JSON off mid-stream and appends a Java `TimeoutException` trailer).
 */
import type { BaseCandidate } from '@cp/domain';

import { classRootsQuery, destinationKind } from './classes';
import { inPool, runQuery, type Binding, type WikidataOptions } from './wdqs';

export type { WikidataOptions } from './wdqs';

export const MIN_SITELINKS = 10;
export const MIN_SITELINKS_VIETNAM = 5;

/**
 * Sitelink bands `[from, to)` the candidates are paged by: each item has one sitelink count, so it
 * lands in exactly one page.
 */
export const SITELINK_BANDS: readonly (readonly [number, number | null])[] = [
  [MIN_SITELINKS_VIETNAM, MIN_SITELINKS],
  [MIN_SITELINKS, 15],
  [15, 20],
  [20, 25],
  [25, 30],
  [30, 34],
  [34, 38],
  [38, 42],
  [42, 46],
  [46, 50],
  [50, 57],
  [57, 65],
  [65, 80],
  [80, 100],
  [100, 130],
  [130, 170],
  [170, 250],
  [250, null],
];

const SITES = 'VALUES ?site { <https://en.wikivoyage.org/> <https://vi.wikivoyage.org/> }';

function bandFilter([from, to]: readonly [number, number | null]): string {
  return `?sitelinks >= ${String(from)}${to === null ? '' : ` && ?sitelinks < ${String(to)}`}`;
}

/**
 * One row per item: values sampled, the largest population, every class and title. The country
 * code is the item's own (Hong Kong, Macau, Singapore), else its country's; `upperCountryQuery`
 * fills the few left without one.
 */
export function candidateQuery(
  band: readonly [number, number | null] = [MIN_SITELINKS, null],
): string {
  return `SELECT ?item ?sitelinks (COALESCE(SAMPLE(?own_), SAMPLE(?iso_)) AS ?iso)
  (SAMPLE(?coord_) AS ?coord)
  (MAX(?pop_) AS ?pop) (SAMPLE(?image_) AS ?image) (SAMPLE(?banner_) AS ?banner)
  (SAMPLE(?gn_) AS ?gn) (SAMPLE(?en_) AS ?en) (SAMPLE(?vi_) AS ?vi) (SAMPLE(?elev_) AS ?elev)
  (GROUP_CONCAT(DISTINCT ?cls_; separator=" ") AS ?classes)
  (GROUP_CONCAT(DISTINCT ?title_; separator="|") AS ?titles) WHERE {
  ${SITES}
  ?wv schema:about ?item ; schema:isPartOf ?site ; schema:name ?title_ .
  ?item wikibase:sitelinks ?sitelinks . FILTER(${bandFilter(band)})
  ?item wdt:P625 ?coord_ .
  OPTIONAL { ?item wdt:P31 ?cls_ }
  OPTIONAL { ?item wdt:P297 ?own_ }
  OPTIONAL { ?item wdt:P17/wdt:P297 ?iso_ }
  OPTIONAL { ?item wdt:P1082 ?pop_ }
  OPTIONAL { ?item wdt:P18 ?image_ }
  OPTIONAL { ?item wdt:P948 ?banner_ }
  OPTIONAL { ?item wdt:P1566 ?gn_ }
  OPTIONAL { ?item wdt:P2044 ?elev_ }
  OPTIONAL { ?item rdfs:label ?en_ FILTER(lang(?en_) = "en") }
  OPTIONAL { ?item rdfs:label ?vi_ FILTER(lang(?vi_) = "vi") }
} GROUP BY ?item ?sitelinks`;
}

/**
 * The country code of items whose country has none, from that country's country: the Netherlands
 * has no code of its own, the Kingdom of the Netherlands has `NL`.
 */
export function upperCountryQuery(qids: readonly string[]): string {
  return `SELECT ?item ?iso WHERE {
  VALUES ?item { ${qids.map((qid) => `wd:${qid}`).join(' ')} }
  ?item wdt:P17/wdt:P17/wdt:P297 ?iso .
}`;
}

/** How many Wikivoyage editions cover each item of a band. */
export function wikivoyageCountQuery(band: readonly [number, number | null]): string {
  return `SELECT ?item (COUNT(DISTINCT ?any) AS ?editions) WHERE {
  ${SITES}
  ?wv schema:about ?item ; schema:isPartOf ?site .
  ?item wikibase:sitelinks ?sitelinks . FILTER(${bandFilter(band)})
  ?any schema:about ?item ; schema:isPartOf ?anySite .
  FILTER(STRENDS(STR(?anySite), ".wikivoyage.org/"))
} GROUP BY ?item`;
}

/** `…/Special:FilePath/Hoi%20An.jpg` → `Hoi An.jpg`. */
export function commonsFileName(url: string): string | null {
  const at = url.lastIndexOf('/Special:FilePath/');
  if (at < 0) return null;
  return decodeURIComponent(url.slice(at + '/Special:FilePath/'.length)).replace(/_/gu, ' ');
}

const POINT = /^Point\(([-\d.eE]+) ([-\d.eE]+)\)$/u;

/** A Wikivoyage-linked item before its classes are judged. */
export interface WikivoyageItem extends Omit<BaseCandidate, 'kind'> {
  readonly classes: readonly string[];
  readonly titles: readonly string[];
}

/**
 * The candidate query's rows (one per item), parsed; rows with no centre or name go, and a row
 * with no country code keeps an empty one.
 */
export function itemsFromBindings(bindings: readonly Binding[]): WikivoyageItem[] {
  return bindings.flatMap((row) => {
    const value = (key: string) => row[key]?.value;
    const item = value('item');
    const point = POINT.exec(value('coord') ?? '');
    const iso = value('iso');
    const en = value('en');
    const vi = value('vi');
    if (item === undefined || point === null) return [];
    const name = iso === 'VN' ? (vi ?? en) : (en ?? vi);
    if (name === undefined) return [];
    const pop = Number(value('pop'));
    const gn = Number(value('gn'));
    const elevation = Number(value('elev'));
    const split = (key: string, by: string) =>
      (value(key) ?? '').split(by).filter((part) => part !== '');
    return [
      {
        qid: item.slice(item.lastIndexOf('/') + 1),
        geonamesId: Number.isInteger(gn) && gn > 0 ? gn : null,
        name,
        names: { ...(en === undefined ? {} : { en }), ...(vi === undefined ? {} : { vi }) },
        countryCode: iso !== undefined && /^[A-Z]{2}$/u.test(iso) ? iso : '',
        admin1: null,
        lat: Number(point[2]),
        lng: Number(point[1]),
        population: Number.isFinite(pop) && pop > 0 ? Math.round(pop) : null,
        sitelinks: Number(value('sitelinks') ?? 0),
        photoFile: commonsFileName(value('banner') ?? value('image') ?? ''),
        elevationM:
          Number.isFinite(elevation) && value('elev') !== undefined ? Math.round(elevation) : null,
        classes: split('classes', ' ').map((url) => url.slice(url.lastIndexOf('/') + 1)),
        titles: split('titles', '|'),
      },
    ];
  });
}

/**
 * The items that are destinations, each with its kind and Wikivoyage edition count: at least 10
 * sitelinks (5 in Vietnam) and a destination class.
 */
export function destinationsFromItems(
  items: readonly WikivoyageItem[],
  rootsOf: ReadonlyMap<string, ReadonlySet<string>>,
  editions: ReadonlyMap<string, number>,
): BaseCandidate[] {
  const seen = new Set<string>();
  return items.flatMap(({ classes, titles, ...item }) => {
    const qid = item.qid ?? '';
    const min = item.countryCode === 'VN' ? MIN_SITELINKS_VIETNAM : MIN_SITELINKS;
    if (seen.has(qid) || item.countryCode === '' || item.sitelinks < min) return [];
    const labels = [item.names.en, item.names.vi].flatMap((label) =>
      label === undefined ? [] : [label],
    );
    const kind = destinationKind({ classes, titles, labels, population: item.population }, rootsOf);
    if (kind === null) return [];
    seen.add(qid);
    return [{ ...item, kind, wikivoyage: editions.get(qid) ?? 1 }];
  });
}

export const CLASSES_PER_QUERY = 250;

export async function loadWikidataCandidates(
  options: WikidataOptions = {},
): Promise<BaseCandidate[]> {
  type Page = { items: WikivoyageItem[] } | { editions: Binding[] };
  const pages = await inPool<Page>(
    SITELINK_BANDS.flatMap((band) => {
      const label = `sitelinks ${String(band[0])}–${band[1] === null ? '' : String(band[1])}`;
      return [
        async () => ({
          items: itemsFromBindings(await runQuery(candidateQuery(band), label, options)),
        }),
        async () => ({
          editions: await runQuery(wikivoyageCountQuery(band), `${label} editions`, options),
        }),
      ];
    }),
    5,
  );
  const parsed = pages.flatMap((page) => ('items' in page ? page.items : []));
  const stateless = parsed.flatMap((item) =>
    item.countryCode === '' && item.qid !== null ? [item.qid] : [],
  );
  const upper = new Map<string, string>();
  for (let at = 0; at < stateless.length; at += CLASSES_PER_QUERY) {
    const rows = await runQuery(
      upperCountryQuery(stateless.slice(at, at + CLASSES_PER_QUERY)),
      `upper countries page ${String(at / CLASSES_PER_QUERY + 1)}`,
      options,
    );
    for (const row of rows) {
      const item = row['item']?.value;
      const iso = row['iso']?.value;
      if (item !== undefined && iso !== undefined && /^[A-Z]{2}$/u.test(iso)) {
        upper.set(item.slice(item.lastIndexOf('/') + 1), iso);
      }
    }
  }
  const items = parsed.map((item) =>
    item.countryCode === '' ? { ...item, countryCode: upper.get(item.qid ?? '') ?? '' } : item,
  );
  const editions = new Map<string, number>();
  for (const row of pages.flatMap((page) => ('editions' in page ? page.editions : []))) {
    const item = row['item']?.value;
    if (item !== undefined) {
      editions.set(item.slice(item.lastIndexOf('/') + 1), Number(row['editions']?.value ?? 1));
    }
  }
  const classes = [...new Set(items.flatMap((item) => item.classes))];
  const batches: string[][] = [];
  for (let at = 0; at < classes.length; at += CLASSES_PER_QUERY) {
    batches.push(classes.slice(at, at + CLASSES_PER_QUERY));
  }
  const rootRows = await inPool(
    batches.map(
      (batch, index) => () =>
        runQuery(classRootsQuery(batch), `class roots page ${String(index + 1)}`, options),
    ),
    5,
  );
  const rootsOf = new Map<string, Set<string>>();
  for (const row of rootRows.flat()) {
    const cls = row['c']?.value;
    const root = row['root']?.value;
    if (cls === undefined || root === undefined) continue;
    const key = cls.slice(cls.lastIndexOf('/') + 1);
    rootsOf.set(key, (rootsOf.get(key) ?? new Set()).add(root.slice(root.lastIndexOf('/') + 1)));
  }
  return destinationsFromItems(items, rootsOf, editions);
}
