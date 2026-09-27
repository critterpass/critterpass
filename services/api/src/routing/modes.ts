/**
 * Wire travel modes and the Mapbox profile each one routes on. Transit has no Mapbox profile
 * (see ./README.md), so it maps to `undefined` and callers return a flagged estimate instead.
 */
import type { TravelMode } from '@cp/domain';

export const WIRE_MODES = ['walk', 'scooter', 'drive', 'transit'] as const;
export type WireMode = (typeof WIRE_MODES)[number];

export const WIRE_TO_TRAVEL_MODE: Readonly<Record<WireMode, TravelMode>> = {
  walk: 'pedestrian',
  scooter: 'motor_scooter',
  drive: 'auto',
  transit: 'multimodal',
};

export const TRAVEL_TO_WIRE_MODE: Readonly<Record<TravelMode, WireMode>> = {
  pedestrian: 'walk',
  motor_scooter: 'scooter',
  auto: 'drive',
  multimodal: 'transit',
};

export type MapboxProfile = 'walking' | 'cycling' | 'driving' | 'driving-traffic';

/**
 * Driving always uses `driving-traffic` (live traffic, `depart_at` for predicted traffic).
 * Scooters use `cycling`: it keeps off motorways (where most of our SEA destinations ban
 * scooters) and allows the narrow lanes scooters take; its durations assume bicycle speed, so a
 * scooter ETA is conservative (never earlier than reality).
 */
export function mapboxProfileFor(mode: TravelMode): MapboxProfile | undefined {
  switch (mode) {
    case 'pedestrian':
      return 'walking';
    case 'motor_scooter':
      return 'cycling';
    case 'auto':
      return 'driving-traffic';
    case 'multimodal':
      return undefined;
  }
}

/** Matrices use plain `driving` once they outgrow a single `driving-traffic` request (see ./matrix.ts). */
export function mapboxMatrixProfileFor(
  mode: TravelMode,
  coordinateCount: number,
  trafficCoordinateLimit: number,
): MapboxProfile | undefined {
  const profile = mapboxProfileFor(mode);
  if (profile === 'driving-traffic' && coordinateCount > trafficCoordinateLimit) return 'driving';
  return profile;
}
