/**
 * Place photos: for every curated place of a destination (the places swipe decks and Explore's
 * picks are drawn from), the image Wikidata gives the place, from Wikimedia Commons under a free
 * licence with its credit. One Wikidata query per destination finds the items with an image
 * around its places; `matchPlace` decides which item, if any, a place is. A stock photo stands for
 * a place only as a labelled generic one (generic.ts), never as the place itself.
 */
import { poiRefSubject, type ContentItem, mediaItemSchema } from '@cp/content';

import { isGenericTitle } from './generic';
import { getJson, type SourceHttp } from './http';
import { matchPlace, type PlaceMatch, type WikidataPlace } from './place-match';
import { commonsCandidate, commonsFiles, type CommonsRules } from './wikimedia';

/** A curated place as the committed places batches carry it. */
export interface MediaPlace {
  /** `fsq_os:<id>` or `overture:<id>` */
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
 * Whether an item may show `subject`: a place shows a photo of itself (Commons), or a stock photo
 * only when the item is marked generic, which the app labels as not this place.
 */
export function sourceAllowedFor(source: string, subject: string, title: string | null): boolean {
  if (!subject.startsWith('poi:') || source === 'wikimedia') return true;
  return isGenericTitle(title);
}

const SPARQL = 'https://query.wikidata.org/sparql';
const EARTH_KM = 6371;
const MARGIN_KM = 2;
const MAX_RADIUS_KM = 80;

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

interface SparqlRow {
  item: { value: string };
  lat: { value: string };
  lng: { value: string };
  image: { value: string };
  labels?: { value: string };
}

/** Every Wikidata item with an image within the circle around `places`. */
export async function wikidataAround(
  http: SourceHttp,
  places: readonly MediaPlace[],
): Promise<WikidataPlace[]> {
  if (places.length === 0) return [];
  const around = aroundOf(places);
  const query = `SELECT ?item ?lat ?lng ?image (GROUP_CONCAT(DISTINCT ?label; separator="|") AS ?labels) WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?loc .
    bd:serviceParam wikibase:center "Point(${around.lng.toFixed(4)} ${around.lat.toFixed(4)})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${String(around.km)}" . }
  ?item wdt:P18 ?image .
  FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q56061 }
  OPTIONAL { ?item rdfs:label|skos:altLabel ?label FILTER(LANG(?label) IN ("en", "vi")) }
  BIND(geof:latitude(?loc) AS ?lat) BIND(geof:longitude(?loc) AS ?lng)
} GROUP BY ?item ?lat ?lng ?image`;
  const url = new URL(SPARQL);
  url.searchParams.set('query', query);
  const body = await getJson<{ results: { bindings: SparqlRow[] } }>(http, url, {
    headers: { accept: 'application/sparql-results+json' },
  });
  const byId = new Map<string, WikidataPlace>();
  for (const row of body.results.bindings) {
    const id = row.item.value.slice(row.item.value.lastIndexOf('/') + 1);
    if (byId.has(id)) continue;
    const name = decodeURIComponent(row.image.value.slice(row.image.value.lastIndexOf('/') + 1));
    byId.set(id, {
      id,
      labels: (row.labels?.value ?? '').split('|').filter(Boolean),
      lat: Number(row.lat.value),
      lng: Number(row.lng.value),
      file: `File:${name.replace(/_/gu, ' ')}`,
    });
  }
  return [...byId.values()];
}

export interface PlacePhoto {
  readonly place: MediaPlace;
  readonly match: PlaceMatch;
  readonly item: ContentItem<'media'>;
}

/**
 * The photo of every place a Wikidata item stands for, as candidates (a file several places
 * share carries all their subjects). Places without a match, or whose file has no reusable
 * licence or is too small, get nothing.
 */
export async function placePhotos(
  http: SourceHttp,
  places: readonly MediaPlace[],
): Promise<PlacePhoto[]> {
  const matched: { place: MediaPlace; match: PlaceMatch }[] = [];
  for (const destination of [...new Set(places.map((p) => p.destination))]) {
    const own = places.filter((p) => p.destination === destination);
    const items = await wikidataAround(http, own);
    for (const place of own) {
      const match = matchPlace(place, items);
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
