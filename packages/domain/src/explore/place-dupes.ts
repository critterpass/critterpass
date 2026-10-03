/**
 * One place, several rows: the places index merges sources, but the same beach or café can still
 * arrive as separate POIs (an Overture row in Vietnamese, another in English, a Foursquare one).
 * Lists that offer places (the swipe deck, Explore's picks) keep the first of such rows. Two rows
 * are the same place when they share a category, lie close (300 m; 2 km for beaches and nature,
 * which run long), and their names match once accents are folded and generic words dropped
 * ("beach", "bãi biển", "city", the destination's name). Names must match exactly after that, so
 * "Non Nước - My Khe Beach" stays apart from "My Khe Beach".
 */

export interface PlaceIdentity {
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
}

const NEAR_M = 300;
const LONG_NEAR_M = 2_000;
const LONG = new Set(['beach', 'nature']);
const GENERIC = new Set([
  'beach',
  'bai',
  'bien',
  'tam',
  'city',
  'thanh',
  'pho',
  'the',
  'vietnam',
  'viet',
  'nam',
]);

function words(text: string): string[] {
  return text
    .replace(/[đĐ]/gu, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** The words that say which place it is, sorted: '' when nothing is left. */
export function placeNameKey(name: string, destination = ''): string {
  const own = new Set(words(destination));
  return [...new Set(words(name).filter((word) => !GENERIC.has(word) && !own.has(word)))]
    .sort()
    .join(' ');
}

function metres(a: PlaceIdentity, b: PlaceIdentity): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function samePlace(a: PlaceIdentity, b: PlaceIdentity, destination = ''): boolean {
  if (a.category !== b.category) return false;
  const key = placeNameKey(a.name, destination);
  if (key === '' || key !== placeNameKey(b.name, destination)) return false;
  return metres(a, b) <= (LONG.has(a.category) ? LONG_NEAR_M : NEAR_M);
}

/** `places` in order without the later rows of a place already listed. */
export function distinctPlaces<T extends PlaceIdentity>(
  places: readonly T[],
  destination = '',
): T[] {
  const kept: T[] = [];
  for (const place of places) {
    if (!kept.some((other) => samePlace(other, place, destination))) kept.push(place);
  }
  return kept;
}
