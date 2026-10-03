/**
 * The GeoJSON and style expressions behind `PlaceDotsLayer`: every place is a feature drawn by the
 * map itself (no view per place), so 500 places pan and zoom like the base map. Saved places carry
 * their category sprite from the map style (`pin-food`, …) and a badge in the saver's colour;
 * Tokek's suggestions are dots. A filter dims the places it leaves out to 20 % instead of removing
 * them, so nothing jumps when it changes.
 */
/* eslint-disable lingui/no-unlocalized-strings -- GeoJSON keys and MapLibre expressions, never copy. */
import type { CircleLayerSpecification } from '@maplibre/maplibre-react-native';
import type { Feature, FeatureCollection, Point } from 'geojson';

type CirclePaint = NonNullable<CircleLayerSpecification['paint']>;
type NumberExpression = NonNullable<CirclePaint['circle-radius']>;

export type PlaceDotTier = 'saved' | 'suggested';

export interface PlaceDot {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly tier: PlaceDotTier;
  /** The style sprite for the category (`CATEGORY_ICON_KEYS`), drawn on saved places. */
  readonly iconKey: string;
  /** How much the crew cares: 0 nobody yet, up to 3 (in the plan, several saves, a must-see). */
  readonly relevance: number;
  /** The badge colour of whoever saved it (7c-1's coloured dot on each saved icon). */
  readonly badgeColor?: string | undefined;
  /** Outside the active filter: drawn at 20 %. */
  readonly dimmed?: boolean | undefined;
}

export interface PlaceDotProperties {
  readonly id: string;
  readonly icon: string;
  readonly weight: number;
  readonly badge: string;
  readonly hasBadge: boolean;
  readonly lit: number;
}

/** Opacity of a place a filter leaves out (7c-1 caption). */
export const DIMMED_OPACITY = 0.2;
/** Saved icons show from town zoom, Tokek's dots from street zoom (7c-1 caption). */
export const TOWN_ZOOM = 11;
export const STREET_ZOOM = 14;
/** Suggestions gather into count bubbles until street zoom. */
export const CLUSTER_MAX_ZOOM = STREET_ZOOM - 1;
export const CLUSTER_RADIUS = 44;

function clampRelevance(value: number): number {
  return Math.max(0, Math.min(3, Math.round(value)));
}

export function placeDotFeatures(
  places: readonly PlaceDot[],
  tier: PlaceDotTier,
): FeatureCollection<Point, PlaceDotProperties> {
  const features: Feature<Point, PlaceDotProperties>[] = [];
  for (const place of places) {
    if (place.tier !== tier) continue;
    features.push({
      type: 'Feature',
      id: place.id,
      geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
      properties: {
        id: place.id,
        icon: place.iconKey,
        weight: clampRelevance(place.relevance),
        badge: place.badgeColor ?? '',
        hasBadge: place.badgeColor !== undefined,
        lit: place.dimmed === true ? 0 : 1,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * 1 for a lit place, the dimmed opacity for one the filter leaves out. A cluster's `lit` sums its
 * places, so a cluster dims only when every place in it is left out.
 */
export const litOpacity: NumberExpression = ['case', ['==', ['get', 'lit'], 0], DIMMED_OPACITY, 1];

/** `clusterProperties` that carry the lit count up into each cluster. */
export const CLUSTER_PROPERTIES = { lit: ['+', ['get', 'lit']] } as const;

/** Saved icon radius by relevance: 13 pt for one save, up to 17 pt for a must-see in the plan. */
export const savedRadius: NumberExpression = [
  'interpolate',
  ['linear'],
  ['get', 'weight'],
  0,
  13,
  3,
  17,
];

/** Suggestion dot radius by relevance: Tokek's plain picks are small. */
export const suggestedRadius: NumberExpression = [
  'interpolate',
  ['linear'],
  ['get', 'weight'],
  0,
  3.5,
  3,
  6,
];

/** Cluster bubbles grow with how many places they hold. */
export const clusterRadius: NumberExpression = [
  'interpolate',
  ['linear'],
  ['get', 'point_count'],
  2,
  16,
  50,
  24,
];

/** The id of a pressed place, or null for a cluster or anything else. */
export function pressedPlaceId(
  features: readonly { properties?: Record<string, unknown> | null }[],
): string | null {
  for (const feature of features) {
    const id = feature.properties?.['id'];
    if (typeof id === 'string' && feature.properties?.['cluster'] !== true) return id;
  }
  return null;
}
