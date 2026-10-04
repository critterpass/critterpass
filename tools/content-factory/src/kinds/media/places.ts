/**
 * Place photos: for every curated place of a destination (the places swipe decks and Explore's
 * picks are drawn from), the image Wikidata gives the place, from Wikimedia Commons under a free
 * licence with its credit. Wikidata gives the items with an image around a destination's places;
 * `matchPlace` decides which item, if any, a place is; a place made from a Wikidata item is that
 * item, by its id. A stock photo stands for
 * a place only as a labelled generic one (generic.ts), never as the place itself.
 */
import { poiRefSubject, type ContentItem, mediaItemSchema } from '@cp/content';
import { STOCK_MEDIA_SOURCES } from '@cp/domain';

import { isGenericTitle } from './generic';
import { getJson, type SourceHttp } from './http';
import { matchPlace, type PlaceMatch, type WikidataPlace } from './place-match';
import { REJECTED_MATCHES } from './rejected';
import { commonsCandidate, commonsFiles, type CommonsRules } from './wikimedia';

/** A curated place as the committed places batches carry it. */
export interface MediaPlace {
  /** `fsq_os:<id>`, `overture:<id>`, or `editorial:wikidata-<Q id>` for a place made from an item */
  readonly ref: string;
  readonly destination: string;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
}

/** A place's own photo may stand portrait (the swipe card is taller than wide) and be a PNG. */
export const PLACE_RULES: CommonsRules = {
  mimes: ['image/jpeg', 'image/png'],
  minPx: 1200,
  landscapeOnly: false,
};

/**
 * Whether an item may show `subject`: a place shows a photo of itself (Commons, or a street-level
 * photo that passed the checks), or a stock photo only when the item is marked generic, which the
 * app labels as not this place.
 */
export function sourceAllowedFor(source: string, subject: string, title: string | null): boolean {
  if (!subject.startsWith('poi:') || !STOCK_MEDIA_SOURCES.includes(source)) return true;
  return isGenericTitle(title);
}

const SPARQL = 'https://query.wikidata.org/sparql';
const EARTH_KM = 6371;
const MARGIN_KM = 2;
/** Bali and Iceland's curated places reach about 105 km from their middle. */
const MAX_RADIUS_KM = 150;
/** The label languages: English and each destination's own. */
const LABEL_LANGUAGES = ['en', 'vi', 'ja', 'id', 'es', 'pt', 'is'];
/** Items per label query: a dense city has thousands of items, too many for one query. */
const ITEMS_PER_QUERY = 200;

function aroundOf(places: readonly MediaPlace[]): { lat: number; lng: number; km: number } {
  const lat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;
  const lng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
  const rad = Math.PI / 180;
  const far = Math.max(
    ...places.map((p) =>
      Math.hypot((p.lat - lat) * rad, (p.lng - lng) * rad * Math.cos(lat * rad)),
    ),
  );
  return { lat, lng, km: Math.min(MAX_RADIUS_KM, Math.ceil(far * EARTH_KM + MARGIN_KM)) };
}

interface Value {
  value: string;
}

async function sparql<Row>(http: SourceHttp, query: string): Promise<Row[]> {
  const url = new URL(SPARQL);
  url.searchParams.set('query', query);
  const body = await getJson<{ results: { bindings: Row[] } }>(http, url, {
    headers: { accept: 'application/sparql-results+json' },
  });
  return body.results.bindings;
}

const idOf = (uri: string) => uri.slice(uri.lastIndexOf('/') + 1);

/** `File:` title of a Commons file path (`.../Special:FilePath/Name%20of%20file.jpg`). */
function fileTitle(uri: string): string {
  return `File:${decodeURIComponent(idOf(uri)).replace(/_/gu, ' ')}`;
}

/**
 * Every Wikidata item with an image within the circle around `places`, administrative areas left
 * out. The items come from one query; their labels from one query per 200 items, since a query
 * for both over a dense city (Kyoto, Mexico City, Lisbon) times out.
 */
export async function wikidataAround(
  http: SourceHttp,
  places: readonly MediaPlace[],
): Promise<WikidataPlace[]> {
  if (places.length === 0) return [];
  const around = aroundOf(places);
  const found = await sparql<{ item: Value; lat: Value; lng: Value; image: Value }>(
    http,
    `SELECT ?item ?lat ?lng ?image WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?loc .
    bd:serviceParam wikibase:center "Point(${around.lng.toFixed(4)} ${around.lat.toFixed(4)})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${String(around.km)}" . }
  ?item wdt:P18 ?image .
  BIND(geof:latitude(?loc) AS ?lat) BIND(geof:longitude(?loc) AS ?lng)
}`,
  );
  const points = new Map<string, Omit<WikidataPlace, 'labels'>>();
  for (const row of found) {
    const id = idOf(row.item.value);
    if (points.has(id)) continue;
    points.set(id, {
      id,
      lat: Number(row.lat.value),
      lng: Number(row.lng.value),
      file: fileTitle(row.image.value),
    });
  }
  const ids = [...points.keys()].sort();
  const languages = LABEL_LANGUAGES.map((language) => `"${language}"`).join(', ');
  const items: WikidataPlace[] = [];
  for (let at = 0; at < ids.length; at += ITEMS_PER_QUERY) {
    const chunk = ids.slice(at, at + ITEMS_PER_QUERY);
    const rows = await sparql<{ item: Value; labels?: Value; area: Value }>(
      http,
      `SELECT ?item (GROUP_CONCAT(DISTINCT ?label; separator="|") AS ?labels) (MAX(?isArea) AS ?area) WHERE {
  VALUES ?item { ${chunk.map((id) => `wd:${id}`).join(' ')} }
  OPTIONAL { ?item rdfs:label|skos:altLabel ?label FILTER(LANG(?label) IN (${languages})) }
  BIND(EXISTS { ?item wdt:P31/wdt:P279* wd:Q56061 } AS ?isArea)
} GROUP BY ?item`,
    );
    for (const row of rows) {
      const point = points.get(idOf(row.item.value));
      if (point === undefined || row.area.value === 'true') continue;
      const labels = [...new Set((row.labels?.value ?? '').split('|').filter(Boolean))];
      items.push({ ...point, labels });
    }
  }
  return items;
}

/** The Wikidata id an editorial place was made from (`editorial:wikidata-Q391406`), or null. */
export function wikidataIdOf(ref: string): string | null {
  return /^editorial:wikidata-(Q\d+)$/u.exec(ref)?.[1] ?? null;
}

/**
 * The items the places made from a Wikidata item are, with their image: such a place is its item,
 * so no name or distance decides it (and the item may lie outside the circle, or be an area).
 */
export async function wikidataOwn(
  http: SourceHttp,
  places: readonly MediaPlace[],
): Promise<Map<string, PlaceMatch>> {
  const ids = new Map<string, MediaPlace>();
  for (const place of places) {
    const id = wikidataIdOf(place.ref);
    if (id !== null) ids.set(id, place);
  }
  if (ids.size === 0) return new Map();
  const rows = await sparql<{ item: Value; image: Value }>(
    http,
    `SELECT ?item ?image WHERE { VALUES ?item { ${[...ids.keys()]
      .sort()
      .map((id) => `wd:${id}`)
      .join(' ')} } ?item wdt:P18 ?image }`,
  );
  const matches = new Map<string, PlaceMatch>();
  for (const row of rows) {
    const id = idOf(row.item.value);
    const place = ids.get(id);
    if (place === undefined || matches.has(place.ref)) continue;
    const item = { id, labels: [place.name], lat: place.lat, lng: place.lng };
    matches.set(place.ref, {
      item: { ...item, file: fileTitle(row.image.value) },
      label: place.name,
      score: 1,
      distanceM: 0,
    });
  }
  return matches;
}

export interface PlacePhoto {
  readonly place: MediaPlace;
  readonly match: PlaceMatch;
  readonly item: ContentItem<'media'>;
}

/**
 * The photo of every place a Wikidata item stands for, as candidates (a file several places
 * share carries all their subjects). Places without a match, or whose file has no reusable
 * licence or is too small, get nothing; an item a reviewer turned down for a place is never its
 * match.
 */
export async function placePhotos(
  http: SourceHttp,
  places: readonly MediaPlace[],
  rejected: Readonly<Record<string, readonly string[]>> = REJECTED_MATCHES,
): Promise<PlacePhoto[]> {
  const matched: { place: MediaPlace; match: PlaceMatch }[] = [];
  const known = await wikidataOwn(http, places);
  for (const destination of [...new Set(places.map((p) => p.destination))]) {
    const own = places.filter((p) => p.destination === destination);
    const items = await wikidataAround(
      http,
      own.filter((p) => wikidataIdOf(p.ref) === null),
    );
    for (const place of own) {
      const itself = known.get(place.ref);
      if (itself !== undefined) matched.push({ place, match: itself });
      if (wikidataIdOf(place.ref) !== null) continue;
      const not = rejected[place.ref] ?? [];
      const match = matchPlace(
        place,
        not.length === 0 ? items : items.filter((item) => !not.includes(item.id)),
      );
      if (match !== null) matched.push({ place, match });
    }
  }
  const files = await commonsFiles(
    http,
    matched.map((m) => m.match.item.file),
  );
  const subjectsOf = new Map<string, string[]>();
  for (const { place, match } of matched) {
    const subjects = subjectsOf.get(match.item.file) ?? [];
    subjects.push(poiRefSubject(place.ref));
    subjectsOf.set(match.item.file, subjects);
  }
  const photos: PlacePhoto[] = [];
  for (const { place, match } of matched) {
    const page = files.get(match.item.file);
    const candidate = page === undefined ? null : commonsCandidate(page, PLACE_RULES);
    if (candidate === null) continue;
    const subjects = [...new Set(subjectsOf.get(match.item.file) ?? [])].slice(0, 20);
    const title = `${place.name} · Wikidata ${match.item.id} (${match.label})`.slice(0, 300);
    photos.push({
      place,
      match,
      item: mediaItemSchema.parse({ ...candidate, title, subjects, rank: 0 }),
    });
  }
  return photos;
}
