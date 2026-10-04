/**
 * The places the trip map draws under the routes (7a-1, 7b-2): what the crew saved, with the
 * first saver's colour on it, and the guide's curated places as small dots. A marker's size says
 * how much the crew cares (more backers, bigger). A filter chip (SAVED, CREW PICKS, the guide's
 * picks, a category) fades everything it leaves out to 20 %; a place already in a day is a stop,
 * never a dot.
 */
import { tokens } from '@cp/design-tokens';
import { CATEGORY_ICON_KEYS, type PoiCategory } from '@cp/domain';

import type { TripIdeaView } from '@/data/ideas/use-trip-ideas';
import type { PlaceDot } from '@/ui/map/planning';

export type MapFilter =
  | { readonly kind: 'none' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'crew' }
  /** The guide's curated places (7b-2 TOKEK'S PICKS). */
  | { readonly kind: 'guide' }
  | { readonly kind: 'category'; readonly category: string };

export const NO_FILTER: MapFilter = { kind: 'none' };

/** Backers that make a saved place a crew pick. */
export const CREW_PICK_BACKERS = 2;

export interface CuratedPlace {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

export interface MapPlace extends PlaceDot {
  readonly name: string;
  readonly category: string;
  readonly backers: number;
}

export interface MapPlacesInput {
  readonly ideas: readonly TripIdeaView[];
  readonly curated: readonly CuratedPlace[];
  /** Places already in a day of the plan. */
  readonly planned: ReadonlySet<string>;
  /** Join order by member id (the saver's colour). */
  readonly joinIndex: ReadonlyMap<string, number>;
  readonly filter: MapFilter;
  /** The guide's dots; they step aside while one day fills the sheet (7a-2). */
  readonly showSuggested: boolean;
}

export function iconKeyOf(category: string | null): string {
  return CATEGORY_ICON_KEYS[(category ?? 'other') as PoiCategory] ?? CATEGORY_ICON_KEYS.other;
}

/** 1 for one saver, 2 for a crew pick, 3 when most of a crew of six backs it. */
export function savedRelevance(backers: number): number {
  if (backers >= 4) return 3;
  return backers >= CREW_PICK_BACKERS ? 2 : 1;
}

function badgeOf(backerIds: readonly string[], joinIndex: ReadonlyMap<string, number>) {
  const first = backerIds.map((id) => joinIndex.get(id)).find((index) => index !== undefined);
  const colors = tokens.member.colors;
  return first === undefined ? undefined : colors[first % colors.length];
}

export function isLit(place: Pick<MapPlace, 'tier' | 'category' | 'backers'>, filter: MapFilter) {
  switch (filter.kind) {
    case 'none':
      return true;
    case 'saved':
      return place.tier === 'saved';
    case 'crew':
      return place.tier === 'saved' && place.backers >= CREW_PICK_BACKERS;
    case 'guide':
      return place.tier === 'suggested';
    case 'category':
      return place.category === filter.category;
  }
}

export function mapPlaces(input: MapPlacesInput): MapPlace[] {
  const seen = new Set(input.planned);
  const places: MapPlace[] = [];
  for (const idea of input.ideas) {
    const key = idea.poiId ?? idea.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const backers = Math.max(1, idea.backerIds.length);
    const place = {
      id: key,
      name: idea.name,
      lat: idea.lat,
      lng: idea.lng,
      tier: 'saved' as const,
      category: idea.category,
      iconKey: iconKeyOf(idea.category),
      relevance: savedRelevance(backers),
      backers,
      badgeColor: badgeOf(idea.backerIds, input.joinIndex),
    };
    places.push({ ...place, dimmed: !isLit(place, input.filter) });
  }
  if (!input.showSuggested) return places;
  for (const poi of input.curated) {
    if (seen.has(poi.id) || poi.lat === null || poi.lng === null) continue;
    seen.add(poi.id);
    const place = {
      id: poi.id,
      name: poi.name,
      lat: poi.lat,
      lng: poi.lng,
      tier: 'suggested' as const,
      category: poi.category ?? 'other',
      iconKey: iconKeyOf(poi.category),
      relevance: 0,
      backers: 0,
    };
    places.push({ ...place, dimmed: !isLit(place, input.filter) });
  }
  return places;
}

/** The places a filter leaves lit. */
export function litPlaces(places: readonly MapPlace[]): MapPlace[] {
  return places.filter((place) => place.dimmed !== true);
}

/** The categories worth a chip: the most common among saved places first, up to `max`. */
export function categoryChips(places: readonly MapPlace[], max = 3): string[] {
  const counts = new Map<string, number>();
  for (const place of places) {
    if (place.category === 'other' || place.category === 'stay') continue;
    const weight = place.tier === 'saved' ? 1000 : 1;
    counts.set(place.category, (counts.get(place.category) ?? 0) + weight);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([category]) => category);
}
