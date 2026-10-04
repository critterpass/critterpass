/**
 * What the places map shows (7c-1, 7c-2): every place as a dot (the filter dims the rest to 20 %,
 * nothing is removed, so nothing jumps), the places lit inside the camera's box (the peek's count),
 * and the carousel's order: the picked place, then the others in view nearest to it.
 */
import { tokens } from '@cp/design-tokens';
import { CATEGORY_ICON_KEYS, type PoiCategory } from '@cp/domain';
import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';

import type { PlaceDot } from '@/ui/map/planning';

import { distanceMeters, type Point } from '../map-model';
import { passesFilter, type HubPlace, type PlacesFilter } from './places-model';

export function iconKeyOf(category: string): string {
  return CATEGORY_ICON_KEYS[category as PoiCategory] ?? CATEGORY_ICON_KEYS.other;
}

/** How much a place matters to the crew, 0–3: the dot's size. */
export function relevanceOf(place: HubPlace): number {
  if (place.standing === 'plan') return 3;
  if (place.standing === 'saved') return Math.min(3, 1 + place.backerIds.length);
  return place.mustSee ? 1 : 0;
}

/**
 * Every place as a map dot: saved and planned places as icons in their first saver's colour,
 * Tokek's as dots; the ones the filter leaves out dimmed, never dropped.
 */
export function placeDots(
  places: readonly HubPlace[],
  filter: PlacesFilter,
  colorOf: (uid: string) => string | undefined,
): PlaceDot[] {
  return places.map((place) => {
    const saver = place.backerIds[0];
    return {
      id: place.id,
      lat: place.lat,
      lng: place.lng,
      tier: place.standing === 'suggested' ? 'suggested' : 'saved',
      iconKey: iconKeyOf(place.category),
      relevance: relevanceOf(place),
      badgeColor:
        place.standing === 'plan'
          ? tokens.color.paper.base
          : saver === undefined
            ? undefined
            : colorOf(saver),
      dimmed: !passesFilter(place, filter),
    };
  });
}

export function within(point: Point, bounds: LngLatBounds | null): boolean {
  if (bounds === null) return true;
  const [west, south, east, north] = bounds;
  const lngIn =
    west <= east ? point.lng >= west && point.lng <= east : point.lng >= west || point.lng <= east;
  return lngIn && point.lat >= south && point.lat <= north;
}

/** `places` ordered by distance from `from`, the name settling a tie. */
export function nearestFirst<T extends HubPlace>(places: readonly T[], from: Point): T[] {
  return places
    .map((place) => ({ place, metres: distanceMeters(from, place) }))
    .sort((a, b) => a.metres - b.metres || a.place.name.localeCompare(b.place.name))
    .map((entry) => entry.place);
}

/** Biggest first: in the plan, then saved by most, then must-sees, then the rest by name. */
export function biggestFirst(places: readonly HubPlace[]): HubPlace[] {
  return [...places].sort(
    (a, b) => relevanceOf(b) - relevanceOf(a) || a.name.localeCompare(b.name),
  );
}

export interface InViewInput {
  readonly places: readonly HubPlace[];
  readonly filter: PlacesFilter;
  readonly bounds: LngLatBounds | null;
  /** The picked place; the carousel orders from it. */
  readonly anchorId: string | null;
}

export interface InView {
  /** Lit places inside the camera's box, biggest first. */
  readonly inView: readonly HubPlace[];
  /** The carousel: the picked place, then the lit places in view nearest to it. */
  readonly carousel: readonly HubPlace[];
}

export function placesInView(input: InViewInput): InView {
  const lit = input.places.filter((place) => passesFilter(place, input.filter));
  const inView = biggestFirst(lit.filter((place) => within(place, input.bounds)));
  const anchor = input.places.find((place) => place.id === input.anchorId);
  if (anchor === undefined) return { inView, carousel: [] };
  const rest = inView.filter((place) => place.id !== anchor.id);
  return { inView, carousel: [anchor, ...nearestFirst(rest, anchor)] };
}

export function usePlacesInView(input: InViewInput): InView {
  const { places, filter, bounds, anchorId } = input;
  return useMemo(
    () => placesInView({ places, filter, bounds, anchorId }),
    [places, filter, bounds, anchorId],
  );
}
