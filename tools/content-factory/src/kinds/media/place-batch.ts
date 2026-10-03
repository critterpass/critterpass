/**
 * A place-photo batch: `--opt places=da-nang` proposes a photo for each curated place of those
 * destinations, the `first` refs (a live swipe deck's places) ahead of the rest: its own photo
 * from Wikimedia Commons, else a labelled generic stock photo of what its name says it serves
 * (see generic.ts), else nothing (the app draws the category's doodle). Publishing a
 * media release replaces every asset, so the batch carries the live release's other items
 * unchanged: `--opt carry=live` reads it from DATABASE_URL, `--opt carry=<file>` from an exported
 * release artifact.
 */
import { readFileSync } from 'node:fs';

import { loadRelease, mediaItemSchema, poiRefSubject, type ContentItem } from '@cp/content';

import { committedItems } from '../../committed';
import { liveArtifact, openPool } from '../../db';
import { GENERIC_TITLE, genericSubjectFor } from './generic';
import type { SourceHttp } from './http';
import type { SourceCandidate } from './pexels';
import { pexelsPhotos } from './pexels';
import { pixabayPhotos } from './pixabay';
import { placePhotos, type MediaPlace } from './places';
import { REJECTED_GENERIC } from './rejected';

export interface StockKeys {
  readonly pexelsKey: string | undefined;
  readonly pixabayKey: string | undefined;
}

const GENERIC_PER_QUERY = 6;
const MAX_SUBJECTS = 20;
const MIN_PX = 1200;

/** The curated places of `destinations`, `first` refs ahead in their order, merged ones left out. */
export function curatedPlaces(
  destinations: readonly string[],
  first: readonly string[] = [],
  all: readonly ContentItem<'places'>[] = committedItems('places'),
): MediaPlace[] {
  const places = all
    .filter((item) => destinations.includes(item.destination) && item.merge_into === null)
    .map((item) => ({
      ref: item.ref,
      destination: item.destination,
      name: item.name,
      category: item.category,
      lat: item.lat,
      lng: item.lng,
    }));
  const order = (ref: string) => {
    const at = first.indexOf(ref);
    return at === -1 ? first.length : at;
  };
  return places
    .map((place, index) => ({ place, index }))
    .sort((a, b) => order(a.place.ref) - order(b.place.ref) || a.index - b.index)
    .map(({ place }) => place);
}

async function liveItems(source: string): Promise<unknown> {
  if (source !== 'live') return JSON.parse(readFileSync(source, 'utf8')) as unknown;
  const pool = openPool();
  if (pool === null) throw new Error('carry=live reads the live media release: set DATABASE_URL');
  try {
    return await liveArtifact(pool, 'media');
  } finally {
    await pool.end();
  }
}

/**
 * The live release's items this batch keeps: everything except the photos of the places being
 * researched (their new candidates replace them).
 */
export function carriedItems(
  artifact: unknown,
  places: readonly MediaPlace[],
): ContentItem<'media'>[] {
  if (artifact === undefined || artifact === null) return [];
  const researched = new Set(places.map((place) => poiRefSubject(place.ref)));
  return loadRelease(artifact, 'media')
    .items.map((item) => mediaItemSchema.parse(item))
    .filter((item) => !item.subjects.every((subject) => researched.has(subject)));
}

/**
 * Labelled generic stock for `places` (those without a photo of their own): one search per generic
 * subject, its results shared out among the places that need it, at most 20 places per photo.
 */
export async function genericPhotos(
  http: SourceHttp,
  keys: StockKeys,
  places: readonly MediaPlace[],
  /** Ids already in the release for another subject: a generic photo never doubles as one. */
  taken: ReadonlySet<string> = new Set(),
): Promise<Map<string, ContentItem<'media'>>> {
  const groups = new Map<string, { query: string; places: MediaPlace[] }>();
  for (const place of places) {
    const subject = genericSubjectFor(place);
    if (subject === null) continue;
    const group = groups.get(subject.key) ?? { query: subject.query, places: [] };
    group.places.push(place);
    groups.set(subject.key, group);
  }
  const byId = new Map<string, ContentItem<'media'>>();
  for (const { query, places: needing } of groups.values()) {
    const lists: SourceCandidate[][] = [];
    if (keys.pexelsKey)
      lists.push(await pexelsPhotos(http, keys.pexelsKey, query, GENERIC_PER_QUERY));
    if (keys.pixabayKey) {
      lists.push(await pixabayPhotos(http, keys.pixabayKey, query, GENERIC_PER_QUERY));
    }
    const found: SourceCandidate[] = [];
    for (let i = 0; lists.some((list) => i < list.length); i += 1) {
      for (const list of lists) {
        const candidate = list[i];
        if (
          candidate !== undefined &&
          !taken.has(candidate.id) &&
          REJECTED_GENERIC[candidate.id] === undefined &&
          Math.max(candidate.width, candidate.height) >= MIN_PX
        ) {
          found.push(candidate);
        }
      }
    }
    if (found.length === 0) continue;
    needing.slice(0, found.length * MAX_SUBJECTS).forEach((place, index) => {
      const candidate = found[index % found.length];
      if (candidate === undefined) return;
      const existing = byId.get(candidate.id);
      const subjects = [...(existing?.subjects ?? []), poiRefSubject(place.ref)];
      if (subjects.length > MAX_SUBJECTS) return;
      byId.set(
        candidate.id,
        mediaItemSchema.parse({
          ...candidate,
          title: `${GENERIC_TITLE}${query}`,
          subjects,
          rank: 0,
        }),
      );
    });
  }
  return byId;
}

export type PlaceOutcome = 'own' | 'generic' | 'none';

export interface PlaceBatch {
  readonly items: readonly ContentItem<'media'>[];
  readonly carried: readonly ContentItem<'media'>[];
  /** What each place (by ref, in batch order) gets. */
  readonly outcomes: ReadonlyMap<string, PlaceOutcome>;
}

export async function placeBatch(
  http: SourceHttp,
  keys: StockKeys,
  options: Readonly<Record<string, string>>,
  list: (name: string) => string[],
): Promise<PlaceBatch> {
  const places = curatedPlaces(list('places'), list('first'));
  if (places.length === 0) throw new Error(`no curated places in ${options['places'] ?? ''}`);
  const carrySource = options['carry'];
  if (carrySource === undefined) {
    throw new Error('a place batch replaces the live media: pass --opt carry=live or carry=<file>');
  }
  const carried = new Map(
    carriedItems(await liveItems(carrySource), places).map((item) => [item.id, item]),
  );
  const byId = new Map<string, ContentItem<'media'>>();
  for (const { item } of await placePhotos(http, places)) {
    const live = carried.get(item.id);
    // A Commons file the release already has (a destination's landmark) keeps its rank and
    // gains the place.
    if (live !== undefined) {
      const subjects = [...new Set([...live.subjects, ...item.subjects])].slice(0, MAX_SUBJECTS);
      carried.set(item.id, { ...live, subjects });
    } else if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const subjectOf = (place: MediaPlace) => poiRefSubject(place.ref);
  const owned = new Set([...byId.values(), ...carried.values()].flatMap((item) => item.subjects));
  const generic = await genericPhotos(
    http,
    keys,
    places.filter((place) => !owned.has(subjectOf(place))),
    new Set(carried.keys()),
  );
  for (const [id, item] of generic) if (!byId.has(id)) byId.set(id, item);
  const genericSubjects = new Set([...generic.values()].flatMap((item) => item.subjects));
  const outcomes = new Map<string, PlaceOutcome>(
    places.map((place) => [
      place.ref,
      owned.has(subjectOf(place))
        ? 'own'
        : genericSubjects.has(subjectOf(place))
          ? 'generic'
          : 'none',
    ]),
  );
  return { items: [...byId.values()], carried: [...carried.values()], outcomes };
}
