/**
 * The one place match on the phone, used by every search box: every typed word must start a word
 * of the name or the local name ("son" never matches "person"), names that start with the query
 * come first, and the crew's saved ideas come before the curated places. When no name has every
 * word, a word that names a kind of place ("coffee", "chùa", "beach") falls back to places of that
 * kind, ranked by how many of the other words they match, so an offline search over what's saved
 * still answers "coffee near the terraces".
 */
import { CATEGORY_WORDS, foldPlaceText, foldWords, STOP_WORDS, type CategoryWord } from './fold';

export type PlaceSource = 'idea' | 'curated' | 'server';

export interface PlaceCandidate {
  /** The place's own id (the POI's, or the idea's for a dropped pin). */
  readonly id: string;
  readonly poiId: string | null;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly tags: readonly string[];
  readonly source: PlaceSource;
}

export interface MatchOptions {
  readonly limit?: number;
  /** Nearest first among equals, when known. */
  readonly near?: { readonly lat: number; readonly lng: number } | null;
}

const DEFAULT_LIMIT = 20;
const SOURCE_RANK: Readonly<Record<PlaceSource, number>> = { idea: 0, curated: 1, server: 2 };

function tokensOf(place: PlaceCandidate): string[] {
  return foldWords(`${place.name} ${place.nameLocal ?? ''}`);
}

function startsAny(tokens: readonly string[], word: string): boolean {
  return tokens.some((token) => token.startsWith(word));
}

function squaredDistance(place: PlaceCandidate, near: MatchOptions['near']): number {
  if (near === null || near === undefined || place.lat === null || place.lng === null) {
    return Number.MAX_VALUE;
  }
  const dLat = place.lat - near.lat;
  const dLng = (place.lng - near.lng) * Math.cos((near.lat * Math.PI) / 180);
  return dLat * dLat + dLng * dLng;
}

/**
 * One row per place: an idea and the curated place it was saved from are the same place, listed as
 * the idea with the curated place's tags.
 */
export function uniquePlaces(places: readonly PlaceCandidate[]): PlaceCandidate[] {
  const byKey = new Map<string, PlaceCandidate>();
  const sorted = [...places].sort((a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source]);
  for (const place of sorted) {
    const key = place.poiId ?? place.id;
    const kept = byKey.get(key);
    if (kept === undefined) byKey.set(key, place);
    else if (kept.tags.length === 0 && place.tags.length > 0) {
      byKey.set(key, { ...kept, tags: place.tags });
    }
  }
  return [...byKey.values()];
}

interface Scored {
  readonly place: PlaceCandidate;
  readonly rank: number;
}

function byName(places: readonly PlaceCandidate[], words: readonly string[], q: string): Scored[] {
  return places.flatMap((place) => {
    const tokens = tokensOf(place);
    if (!words.every((word) => startsAny(tokens, word))) return [];
    const name = foldPlaceText(place.name);
    const local = foldPlaceText(place.nameLocal ?? '');
    const rank =
      name.startsWith(q) || local.startsWith(q) ? 0 : `${name} ${local}`.includes(q) ? 1 : 2;
    return [{ place, rank }];
  });
}

function byCategory(
  places: readonly PlaceCandidate[],
  kinds: readonly CategoryWord[],
  others: readonly string[],
): Scored[] {
  const inKind = places.filter((place) => kinds.some((kind) => kind.category === place.category));
  const tagged = kinds.filter((kind) => kind.tag !== undefined);
  // "coffee" narrows food to the places tagged or named for it, when there are any.
  const narrowed =
    tagged.length === 0
      ? inKind
      : inKind.filter((place) =>
          tagged.some(
            (kind) =>
              place.tags.includes(kind.tag ?? '') || startsAny(tokensOf(place), kind.tag ?? ''),
          ),
        );
  const pool = narrowed.length > 0 ? narrowed : inKind;
  return pool.map((place) => {
    const tokens = [...tokensOf(place), ...place.tags.flatMap((tag) => foldWords(tag))];
    const hits = others.filter((word) => startsAny(tokens, word)).length;
    return { place, rank: -hits };
  });
}

/** The places matching `query`, best first (pure, for the hooks and their tests). */
export function matchPlaces(
  candidates: readonly PlaceCandidate[],
  query: string,
  options: MatchOptions = {},
): PlaceCandidate[] {
  const q = foldPlaceText(query);
  const words = foldWords(query).filter((word) => !STOP_WORDS.has(word));
  if (q === '' || words.length === 0) return [];
  const places = uniquePlaces(candidates);
  let scored = byName(places, words, q);
  if (scored.length === 0) {
    const kinds = words.flatMap((word) => {
      const kind = CATEGORY_WORDS[word];
      return kind === undefined ? [] : [kind];
    });
    if (kinds.length > 0) {
      scored = byCategory(
        places,
        kinds,
        words.filter((word) => CATEGORY_WORDS[word] === undefined),
      );
    }
  }
  const near = options.near;
  return scored
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        SOURCE_RANK[a.place.source] - SOURCE_RANK[b.place.source] ||
        squaredDistance(a.place, near) - squaredDistance(b.place, near) ||
        a.place.name.localeCompare(b.place.name),
    )
    .slice(0, options.limit ?? DEFAULT_LIMIT)
    .map(({ place }) => place);
}
