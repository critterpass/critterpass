/**
 * A place-photo batch: `--opt places=da-nang,bali` proposes a photo for each curated place of
 * those destinations, the `first` refs (a live swipe deck's places) ahead of the rest: its own
 * photo from Wikimedia Commons, else a labelled generic stock photo of what its name says it
 * serves (see generic.ts), else with `--opt street=on` a street-level photo that passes the checks
 * (street-batch.ts), else nothing (the app draws the category's doodle). The curated places
 * are the committed places batches', or with `--opt curated=live` (or `curated=<file>`) the live
 * places release's, which holds every destination. Publishing a media release replaces every
 * asset, so the batch carries the live release's other items unchanged: `--opt carry=live` reads
 * it from DATABASE_URL, `--opt carry=<file>` from an exported release artifact.
 */
import { readFileSync } from 'node:fs';

import { loadRelease, mediaItemSchema, poiRefSubject, type ContentItem } from '@cp/content';

import { committedItems } from '../../committed';
import { liveArtifact, openPool } from '../../db';
import { genericPhotos, type StockKeys } from './generic-batch';
import type { SourceHttp } from './http';
import type { PlaceMatch } from './place-match';
import { placePhotos, type MediaPlace } from './places';
import { LIVE_SUGGESTED_TO_DROP } from './rejected';
import { streetPhotos, type StreetDeps, type StreetPick, type StreetTally } from './street-batch';

/** The most subjects a media item holds. */
const MAX_SUBJECTS = 20;

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

export type PlaceOutcome = 'own' | 'generic' | 'street' | 'none';

/** What the batch proposes for one place, for the review pages. */
export interface PlaceProposal {
  readonly place: MediaPlace;
  readonly outcome: PlaceOutcome;
  /** The Wikidata item the place was matched to, for a photo of its own. */
  readonly match: Pick<PlaceMatch, 'label' | 'score' | 'distanceM'> | null;
  /** The street-level photo a place with nothing else was given, and why the check kept it. */
  readonly street?: StreetPick;
}

export interface PlaceBatch {
  readonly items: readonly ContentItem<'media'>[];
  readonly carried: readonly ContentItem<'media'>[];
  /** What each place (by ref, in batch order) gets. */
  readonly outcomes: ReadonlyMap<string, PlaceOutcome>;
  readonly proposals: readonly PlaceProposal[];
  /** The stock searches a source did not answer, so the review knows what is thinner. */
  readonly unanswered: readonly string[];
  /** Live photos suggested to drop, with the destinations whose places show them today. */
  readonly suggestedDrops: readonly SuggestedDrop[];
  /** How the places without a photo fared with street-level photos, by destination. */
  readonly street: Readonly<Record<string, StreetTally>> | null;
  /** What the vision checks of this run cost, in millionths of a dollar. */
  readonly streetCostMicros: number;
}

export interface SuggestedDrop {
  readonly id: string;
  readonly reason: string;
  readonly destinations: readonly string[];
}

/** The live release's photos on the suggested-to-drop list, by the destinations showing them. */
export function suggestedDrops(artifact: unknown, places: readonly MediaPlace[]): SuggestedDrop[] {
  if (artifact === undefined || artifact === null) return [];
  const destinationOf = new Map(places.map((p) => [poiRefSubject(p.ref), p.destination]));
  return loadRelease(artifact, 'media').items.flatMap((item) => {
    const reason = LIVE_SUGGESTED_TO_DROP[item.id];
    if (reason === undefined) return [];
    const destinations = [...new Set(item.subjects.flatMap((s) => destinationOf.get(s) ?? []))];
    return [{ id: item.id, reason, destinations }];
  });
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
  /** Street-level photos for the places left with nothing; null leaves them with nothing. */
  street: Omit<StreetDeps, 'http'> | null = null,
): Promise<PlaceBatch> {
  const curated = await curatedItems(options['curated']);
  const places = curatedPlaces(list('places'), list('first'), curated);
  if (places.length === 0) throw new Error(`no curated places in ${options['places'] ?? ''}`);
  const carrySource = options['carry'];
  if (carrySource === undefined) {
    throw new Error('a place batch replaces the live media: pass --opt carry=live or carry=<file>');
  }
  const live = await liveItems(carrySource, 'media');
  const carried = new Map(carriedItems(live, places).map((item) => [item.id, item]));
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
  const bare = places.filter(
    (place) => !owned.has(subject(place)) && !genericSubjects.has(subject(place)),
  );
  const streets = street === null ? null : await streetPhotos({ ...street, http }, bare);
  for (const item of streets?.items ?? []) if (!byId.has(item.id)) byId.set(item.id, item);
  const outcomeOf = (place: MediaPlace): PlaceOutcome => {
    if (owned.has(subject(place))) return 'own';
    if (genericSubjects.has(subject(place))) return 'generic';
    return streets?.picks.has(place.ref) === true ? 'street' : 'none';
  };
  const proposals = places.map((place) => {
    const outcome = outcomeOf(place);
    const pick = streets?.picks.get(place.ref);
    const match = outcome === 'own' ? (matches.get(place.ref) ?? null) : null;
    return {
      place,
      outcome,
      match:
        match === null
          ? null
          : { label: match.label, score: match.score, distanceM: match.distanceM },
      ...(pick === undefined ? {} : { street: pick }),
    };
  });
  return {
    items: [...byId.values()],
    carried: [...carried.values()],
    outcomes: new Map(proposals.map((p) => [p.place.ref, p.outcome])),
    proposals,
    unanswered,
    suggestedDrops: suggestedDrops(live, places),
    street: streets?.tallies ?? null,
    streetCostMicros: streets?.costMicros ?? 0,
  };
}
