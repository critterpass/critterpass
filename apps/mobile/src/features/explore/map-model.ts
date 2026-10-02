/**
 * The Explore map's rules, apart from any rendering: which places a search and the filter chips
 * leave, how many each chip would show, how far someone outside the destination is from it, and
 * the dotted line from where they stand to the chosen place.
 */
import { openState } from './place-model';

export interface MapPoi {
  readonly id: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  /** The stored opening hours (parsed JSON), or null. */
  readonly hours: unknown;
  /** One of the guide's must-sees. */
  readonly mustSee: boolean;
  /** The editors wrote it up (a reason to go), must-see or not. */
  readonly written: boolean;
}

export type MapFilter = 'saved' | 'crew' | 'food' | 'open';

export interface FilterContext {
  readonly savedIds: ReadonlySet<string>;
  /** Places a crewmate swiped yes on, or that matched. */
  readonly crewIds: ReadonlySet<string>;
  readonly tz: string | null;
  readonly now: Date;
}

const FOOD = new Set(['food', 'market']);

function passes(poi: MapPoi, filter: MapFilter, context: FilterContext): boolean {
  if (filter === 'saved') return context.savedIds.has(poi.id);
  if (filter === 'crew') return context.crewIds.has(poi.id);
  if (filter === 'food') return FOOD.has(poi.category);
  const state = openState(poi.hours, context.tz, context.now);
  return state === 'open' || state === 'always';
}

/** Lower-cased with the marks folded away, so "da nang" finds "Đà Nẵng". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/gu, '').replace(/[đĐ]/gu, 'd').toLowerCase();
}

/** Must-sees first, then places the editors wrote up, then the rest. */
function tier(poi: MapPoi): number {
  if (poi.mustSee) return 0;
  return poi.written ? 1 : 2;
}

/**
 * The order every Explore list shows places in: the guide's must-sees, then other written-up
 * places, then the rest; inside each group the nearest to `from` first (where the viewer stands,
 * else the middle of the destination), and the name only to settle a tie.
 */
export function orderPlaces(places: readonly MapPoi[], from: Point | null): MapPoi[] {
  const origin = from ?? centreOf(places);
  return places
    .map((poi) => ({
      poi,
      tier: tier(poi),
      meters: origin === null ? 0 : Math.round(distanceMeters(origin, poi)),
      key: fold(poi.name),
    }))
    .sort(
      (a, b) =>
        a.tier - b.tier || a.meters - b.meters || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    )
    .map((entry) => entry.poi);
}

/** The places every active filter and the search text leave, in the order they were given. */
export function filterPlaces(
  places: readonly MapPoi[],
  filters: ReadonlySet<MapFilter>,
  query: string,
  context: FilterContext,
): MapPoi[] {
  const needle = fold(query.trim());
  return places
    .filter((poi) => [...filters].every((filter) => passes(poi, filter, context)))
    .filter(
      (poi) =>
        needle === '' ||
        fold(poi.name).includes(needle) ||
        (poi.nameLocal !== null && fold(poi.nameLocal).includes(needle)),
    );
}

/** How many places each chip would show on its own. */
export function filterCounts(
  places: readonly MapPoi[],
  context: FilterContext,
): Readonly<Record<MapFilter, number>> {
  const count = (filter: MapFilter) => places.filter((poi) => passes(poi, filter, context)).length;
  return { saved: count('saved'), crew: count('crew'), food: count('food'), open: count('open') };
}

export interface Point {
  readonly lat: number;
  readonly lng: number;
}

const EARTH_M = 6_371_000;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle metres between two points. */
export function distanceMeters(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The middle of the places, where the map opens. */
export function centreOf(places: readonly Point[]): Point | null {
  if (places.length === 0) return null;
  const sum = places.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), {
    lat: 0,
    lng: 0,
  });
  return { lat: sum.lat / places.length, lng: sum.lng / places.length };
}

/** Someone this far from the destination's places is "away": no you-dot, a distance chip instead. */
export const AWAY_M = 60_000;

export type Presence =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'here'; readonly at: Point }
  | { readonly kind: 'away'; readonly meters: number };

export function presence(you: Point | null, places: readonly Point[]): Presence {
  const centre = centreOf(places);
  if (you === null || centre === null) return { kind: 'unknown' };
  const meters = distanceMeters(you, centre);
  return meters > AWAY_M ? { kind: 'away', meters } : { kind: 'here', at: you };
}
