/**
 * A place-photo batch: `--opt places=da-nang,bali` proposes a photo for each curated place of
 * those destinations, the `first` refs (a live swipe deck's places) ahead of the rest: its own
 * photo from Wikimedia Commons, else a labelled generic stock photo of what its name says it
 * serves (see generic.ts), else nothing (the app draws the category's doodle). The curated places
 * are the committed places batches', or with `--opt curated=live` (or `curated=<file>`) the live
 * places release's, which holds every destination.
 *
 * A media batch changes only the items it states: approval lays it over the live release and
 * leaves everything else as it is. So the batch reads the live release (`--opt live=live` from
 * DATABASE_URL, `--opt live=<file>` from an exported artifact) and states, beside its new photos,
 * each live item that shows one of these places: with the subjects it keeps, or with none when it
 * shows nothing any more, which takes it down. The other destinations' photos and the destination
 * media are not in the batch at all.
 */
import { readFileSync } from 'node:fs';

import { loadRelease, mediaItemSchema, poiRefSubject, type ContentItem } from '@cp/content';

import { committedItems } from '../../committed';
import { liveArtifact, openPool } from '../../db';
import { genericPhotos, type StockKeys } from './generic-batch';
import type { SourceHttp } from './http';
import type { PlaceMatch } from './place-match';
import { placePhotos, type MediaPlace } from './places';
import { LIVE_SUGGESTED_TO_DROP, REJECTED_GENERIC } from './rejected';

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
        item.hide !== true &&
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

/** A live item beside the places a batch researches. */
export interface Held {
  readonly item: ContentItem<'media'>;
  /** The subjects it keeps whatever the batch finds: destinations, and places not researched. */
  readonly rest: readonly string[];
  /** It shows one of the researched places today, so the batch has to state it. */
  readonly touched: boolean;
}

/** The live release's items by id, each split into what the batch may change and what it may not. */
export function liveHeld(artifact: unknown, places: readonly MediaPlace[]): Map<string, Held> {
  if (artifact === undefined || artifact === null) return new Map();
  const researched = new Set(places.map((place) => poiRefSubject(place.ref)));
  return new Map(
    loadRelease(artifact, 'media').items.map((raw) => {
      const item = mediaItemSchema.parse(raw);
      const rest = item.subjects.filter((subject) => !researched.has(subject));
      return [item.id, { item, rest, touched: rest.length < item.subjects.length }];
    }),
  );
}

/** A live item the batch takes down or gives other subjects, for the review pages. */
export interface LiveChange {
  readonly id: string;
  readonly reason: string;
  readonly was: readonly string[];
  readonly now: readonly string[];
}

function whyGone(item: ContentItem<'media'>): string {
  const turned = REJECTED_GENERIC[item.id] ?? LIVE_SUGGESTED_TO_DROP[item.id];
  if (turned !== undefined) return `turned down (${turned})`;
  return item.source === 'wikimedia'
    ? 'no longer the photo of its places (a better file, or the match was turned down)'
    : 'no longer among the photos proposed for its places';
}

/**
 * States in `stated` every live item that shows a researched place and that the batch did not
 * propose again: with the subjects it keeps, or with none (a removal). Returns what leaves live and
 * what changes subjects, counting the items the batch proposed again with other subjects.
 */
export function restateLive(
  held: ReadonlyMap<string, Held>,
  stated: Map<string, ContentItem<'media'>>,
): { removed: LiveChange[]; changed: LiveChange[] } {
  const removed: LiveChange[] = [];
  const changed: LiveChange[] = [];
  for (const [id, { item, rest, touched }] of held) {
    if (!touched) continue;
    const again = stated.get(id);
    if (again === undefined) stated.set(id, { ...item, subjects: [...rest] });
    const now = again?.subjects ?? rest;
    const change = { id, reason: whyGone(item), was: item.subjects, now };
    if (now.length === 0) removed.push(change);
    else if (now.length !== item.subjects.length || now.some((s) => !item.subjects.includes(s))) {
      changed.push({ ...change, reason: 'shows other places than before' });
    }
  }
  return { removed, changed };
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
  /** Everything the batch states: new photos, and live items re-stated (with no subjects, removed). */
  readonly items: readonly ContentItem<'media'>[];
  /** The live photos the batch takes down, and the ones it gives other places. */
  readonly removed: readonly LiveChange[];
  readonly changed: readonly LiveChange[];
  /** What each place (by ref, in batch order) gets. */
  readonly outcomes: ReadonlyMap<string, PlaceOutcome>;
  readonly proposals: readonly PlaceProposal[];
  /** The stock searches a source did not answer, so the review knows what is thinner. */
  readonly unanswered: readonly string[];
  /** Live photos suggested to drop, with the destinations whose places show them today. */
  readonly suggestedDrops: readonly SuggestedDrop[];
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
): Promise<PlaceBatch> {
  const curated = await curatedItems(options['curated']);
  const places = curatedPlaces(list('places'), list('first'), curated);
  if (places.length === 0) throw new Error(`no curated places in ${options['places'] ?? ''}`);
  const liveSource = options['live'];
  if (liveSource === undefined) {
    throw new Error(
      'a place batch states what it changes in the live media: pass --opt live=live or live=<file>',
    );
  }
  const live = await liveItems(liveSource, 'media');
  const held = liveHeld(live, places);
  const byId = new Map<string, ContentItem<'media'>>();
  const matches = new Map<string, PlaceMatch>();
  const owned = new Set<string>();
  for (const { place, match, item } of await placePhotos(http, places)) {
    matches.set(place.ref, match);
    for (const s of item.subjects) owned.add(s);
    if (byId.has(item.id)) continue;
    const before = held.get(item.id);
    // A Commons file the release already has (a destination's landmark) keeps its rank and what
    // else it shows, and gains the place.
    byId.set(
      item.id,
      before === undefined
        ? item
        : {
            ...before.item,
            subjects: [...new Set([...before.rest, ...item.subjects])].slice(0, MAX_SUBJECTS),
          },
    );
  }
  const subject = (place: MediaPlace) => poiRefSubject(place.ref);
  const unanswered: string[] = [];
  const generic = await genericPhotos(
    http,
    keys,
    places.filter((place) => !owned.has(subject(place))),
    new Map([...held].map(([id, { rest }]) => [id, rest])),
    unanswered,
  );
  for (const [id, item] of generic) if (!byId.has(id)) byId.set(id, item);
  const genericSubjects = new Set([...generic.values()].flatMap((item) => item.subjects));
  const { removed, changed } = restateLive(held, byId);
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
    removed,
    changed,
    outcomes: new Map(proposals.map((p) => [p.place.ref, p.outcome])),
    proposals,
    unanswered,
    suggestedDrops: suggestedDrops(live, places),
  };
}
