/**
 * A place-photo batch: `--opt places=da-nang,bali` proposes a photo for each curated place of
 * those destinations, the `first` refs (a live swipe deck's places) ahead of the rest: its own
 * photo from Wikimedia Commons, else a labelled generic stock photo of what its name says it
 * serves (see generic.ts), else nothing (the app draws the category's doodle). The curated places
 * are the committed places batches', or with `--opt curated=live` (or `curated=<file>`) the live
 * places release's, which holds every destination. Publishing a media release replaces every
 * asset, so the batch carries the live release's other items unchanged: `--opt carry=live` reads
 * it from DATABASE_URL, `--opt carry=<file>` from an exported release artifact.
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
import type { PlaceMatch } from './place-match';
import { placePhotos, type MediaPlace } from './places';
import { REJECTED_GENERIC } from './rejected';

export interface StockKeys {
  readonly pexelsKey: string | undefined;
  readonly pixabayKey: string | undefined;
}

/** Results asked of each stock source for one generic subject, at least and at most. */
const GENERIC_PER_QUERY = 6;
const MAX_PER_QUERY = 40;
/** The places one generic photo is spread over, so a deck does not repeat one picture. */
const PLACES_PER_PHOTO = 8;
/** The most subjects a media item holds. */
const MAX_SUBJECTS = 20;
const MIN_PX = 1200;

/** The media subject of a place ref, or null for a ref publishing cannot resolve to a place. */
function subjectOf(ref: string): string | null {
  try {
    return poiRefSubject(ref);
  } catch {
    return null;
  }
}

/**
 * The curated places of `destinations`, `first` refs ahead in their order. Merged ones are left
 * out, and so are places a media subject cannot name (an editorial place made from a Wikidata
 * item has no source ref publishing resolves).
 */
export function curatedPlaces(
  destinations: readonly string[],
  first: readonly string[] = [],
  all: readonly ContentItem<'places'>[] = committedItems('places'),
): MediaPlace[] {
  const places = all
    .filter(
      (item) =>
        destinations.includes(item.destination) &&
        item.merge_into === null &&
        subjectOf(item.ref) !== null,
    )
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

async function liveItems(source: string, kind: 'media' | 'places'): Promise<unknown> {
  if (source !== 'live') return JSON.parse(readFileSync(source, 'utf8')) as unknown;
  const pool = openPool();
  if (pool === null) throw new Error(`live reads the live ${kind} release: set DATABASE_URL`);
  try {
    return await liveArtifact(pool, kind);
  } finally {
    await pool.end();
  }
}

/**
 * The live release's items this batch keeps: everything except the photos of the places being
 * researched (their new candidates replace them). An item other subjects share stays for those.
 */
export function carriedItems(
  artifact: unknown,
  places: readonly MediaPlace[],
): ContentItem<'media'>[] {
  if (artifact === undefined || artifact === null) return [];
  const researched = new Set(places.map((place) => poiRefSubject(place.ref)));
  return loadRelease(artifact, 'media')
    .items.map((item) => mediaItemSchema.parse(item))
    .map((item) => ({ ...item, subjects: item.subjects.filter((s) => !researched.has(s)) }))
    .filter((item) => item.subjects.length > 0);
}

/**
 * Labelled generic stock for `places` (those without a photo of their own): one search per generic
 * subject, asking for more results the more places need it, shared out among them at about eight
 * places per photo and never more than 20.
 */
export async function genericPhotos(
  http: SourceHttp,
  keys: StockKeys,
  places: readonly MediaPlace[],
  /** Ids already in the release for another subject: a generic photo never doubles as one. */
  taken: ReadonlySet<string> = new Set(),
  /** Filled with the searches a source did not answer (`pixabay: tacos`). */
  unanswered: string[] = [],
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
    const perQuery = Math.min(
      MAX_PER_QUERY,
      Math.max(GENERIC_PER_QUERY, Math.ceil(needing.length / PLACES_PER_PHOTO)),
    );
    // A source that stays busy for one search is left out of it; the other still answers.
    const from = async (source: string, search: Promise<SourceCandidate[]>) => {
      try {
        lists.push(await search);
      } catch {
        unanswered.push(`${source}: ${query}`);
      }
    };
    if (keys.pexelsKey) await from('pexels', pexelsPhotos(http, keys.pexelsKey, query, perQuery));
    if (keys.pixabayKey) {
      await from('pixabay', pixabayPhotos(http, keys.pixabayKey, query, perQuery));
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
      const subjects = [...new Set([...(existing?.subjects ?? []), poiRefSubject(place.ref)])];
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

/** What the batch proposes for one place, for the review pages. */
export interface PlaceProposal {
  readonly place: MediaPlace;
  readonly outcome: PlaceOutcome;
  /** The Wikidata item the place was matched to, for a photo of its own. */
  readonly match: Pick<PlaceMatch, 'label' | 'score' | 'distanceM'> | null;
}

export interface PlaceBatch {
  readonly items: readonly ContentItem<'media'>[];
  readonly carried: readonly ContentItem<'media'>[];
  /** What each place (by ref, in batch order) gets. */
  readonly outcomes: ReadonlyMap<string, PlaceOutcome>;
  readonly proposals: readonly PlaceProposal[];
  /** The stock searches a source did not answer, so the review knows what is thinner. */
  readonly unanswered: readonly string[];
}

/** The curated places a batch works over: the committed batches', or a live or exported release's. */
async function curatedItems(source: string | undefined): Promise<ContentItem<'places'>[]> {
  if (source === undefined) return committedItems('places');
  return [...loadRelease(await liveItems(source, 'places'), 'places').items];
}

export async function placeBatch(
  http: SourceHttp,
  keys: StockKeys,
  options: Readonly<Record<string, string>>,
  list: (name: string) => string[],
): Promise<PlaceBatch> {
  const curated = await curatedItems(options['curated']);
  const places = curatedPlaces(list('places'), list('first'), curated);
  if (places.length === 0) throw new Error(`no curated places in ${options['places'] ?? ''}`);
  const carrySource = options['carry'];
  if (carrySource === undefined) {
    throw new Error('a place batch replaces the live media: pass --opt carry=live or carry=<file>');
  }
  const carried = new Map(
    carriedItems(await liveItems(carrySource, 'media'), places).map((item) => [item.id, item]),
  );
  const byId = new Map<string, ContentItem<'media'>>();
  const matches = new Map<string, PlaceMatch>();
  for (const { place, match, item } of await placePhotos(http, places)) {
    matches.set(place.ref, match);
    const live = carried.get(item.id);
    // A Commons file the release already has (a destination's landmark) keeps its rank and
    // gains the place.
    if (live !== undefined) {
      const subjects = [...new Set([...live.subjects, ...item.subjects])].slice(0, MAX_SUBJECTS);
      carried.set(item.id, { ...live, subjects });
    } else if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const subject = (place: MediaPlace) => poiRefSubject(place.ref);
  const owned = new Set([...byId.values(), ...carried.values()].flatMap((item) => item.subjects));
  const unanswered: string[] = [];
  const generic = await genericPhotos(
    http,
    keys,
    places.filter((place) => !owned.has(subject(place))),
    new Set(carried.keys()),
    unanswered,
  );
  for (const [id, item] of generic) if (!byId.has(id)) byId.set(id, item);
  const genericSubjects = new Set([...generic.values()].flatMap((item) => item.subjects));
  const outcomeOf = (place: MediaPlace): PlaceOutcome => {
    if (owned.has(subject(place))) return 'own';
    return genericSubjects.has(subject(place)) ? 'generic' : 'none';
  };
  const proposals = places.map((place) => {
    const outcome = outcomeOf(place);
    const match = outcome === 'own' ? (matches.get(place.ref) ?? null) : null;
    return {
      place,
      outcome,
      match:
        match === null
          ? null
          : { label: match.label, score: match.score, distanceM: match.distanceM },
    };
  });
  return {
    items: [...byId.values()],
    carried: [...carried.values()],
    outcomes: new Map(proposals.map((p) => [p.place.ref, p.outcome])),
    proposals,
    unanswered,
  };
}
