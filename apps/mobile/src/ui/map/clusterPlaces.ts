/**
 * Pure clustering logic for `CpMap` (F-031 "Pins": "cluster bubble '+9'"), split out from the
 * component so `CpMap.tsx` stays under docs/code-standards.md's 300-line file limit and this pure
 * function stays trivially unit-testable on its own.
 *
 * Computed in plain JS rather than via MapLibre's native `GeoJSONSource` cluster support: pins are
 * rich React overlays (avatar stacks, category doodles, entrance motion), not simple symbol-layer
 * icons, so the cluster/expand decision has to happen before anything reaches the native map
 * anyway.
 */
import type { LngLat, LngLatBounds } from '@maplibre/maplibre-react-native';

import type { AvatarStackMember } from './AvatarStackPin';

export interface MapPlace {
  readonly id: string;
  readonly name: string;
  /** `CATEGORY_ICON_KEYS[category]` — resolved by the data layer, not a `PoiCategory` enum
   *  (`mobile-ui` may not depend on `@cp/domain`, tools/lint/boundaries.js). */
  readonly iconKey: string;
  /** Already-localised human-readable category, e.g. `"Food"`. */
  readonly categoryLabel: string;
  readonly lat: number;
  readonly lng: number;
  readonly members?: readonly AvatarStackMember[];
}

export interface PlaceCluster {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly places: readonly MapPlace[];
}

/** Groups places within roughly `radiusPx` screen pixels of each other at the given zoom into one
 *  cluster — a standard tile-grid approximation (Web Mercator: ~256px tile spans 360/2^zoom
 *  degrees of longitude at the equator), not pixel-perfect at high latitudes but good enough to
 *  decide "these pins would overlap," which is the only thing a cluster bubble needs. */
export function clusterPlaces(
  places: readonly MapPlace[],
  zoom: number,
  radiusPx = 40,
): PlaceCluster[] {
  if (places.length === 0) return [];
  const cellDegrees = (360 / (256 * 2 ** zoom)) * radiusPx;
  const cells = new Map<string, MapPlace[]>();
  for (const place of places) {
    const key = `${String(Math.floor(place.lat / cellDegrees))}:${String(Math.floor(place.lng / cellDegrees))}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(place);
    else cells.set(key, [place]);
  }
  return Array.from(cells.entries()).map(([key, members]) => ({
    // Internal cluster id, never rendered as copy — not user-facing text.
    // eslint-disable-next-line lingui/no-unlocalized-strings
    id: `cluster-${key}`,
    lat: members.reduce((sum, p) => sum + p.lat, 0) / members.length,
    lng: members.reduce((sum, p) => sum + p.lng, 0) / members.length,
    places: members,
  }));
}

export function isWithinBounds(point: LngLat, bounds: LngLatBounds): boolean {
  const [west, south, east, north] = bounds;
  const [lng, lat] = point;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

export function clusterBounds(cluster: PlaceCluster): LngLatBounds {
  const lats = cluster.places.map((p) => p.lat);
  const lngs = cluster.places.map((p) => p.lng);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}
