/**
 * Nearest airports to a coarse point (the IP geo hint's city, never GPS) with a drive estimate for
 * the "Malaysia · 40 min away" line, and the "nearest is 3 h away" far-from-airports state.
 */
import { distanceM, type LatLng } from '../location/geo';
import type { Airport } from './types';

export interface NearbyAirport {
  readonly airport: Airport;
  readonly distanceKm: number;
  /** Straight-line drive estimate at intercity speed with a detour factor, rounded to 5 min. */
  readonly driveMinutes: number;
}

/** Beyond this the nearest airport is "far" and the list says so instead of implying it is close. */
export const FAR_FROM_AIRPORT_MINUTES = 150;

/** Airport runs are mostly highway: a city-traffic router speed would overstate them. */
const AIRPORT_RUN_KMH = 70;
const DETOUR_FACTOR = 1.2;

export function driveMinutesBetween(from: LatLng, to: LatLng): number {
  const km = (distanceM(from, to) / 1000) * DETOUR_FACTOR;
  return Math.max(5, Math.round(((km / AIRPORT_RUN_KMH) * 60) / 5) * 5);
}

export function nearestAirports(
  airports: readonly Airport[],
  point: LatLng,
  limit = 3,
  maxRank: 1 | 2 | 3 = 2,
): NearbyAirport[] {
  return airports
    .filter((a) => a.rank <= maxRank)
    .map((airport) => ({ airport, d: distanceM(point, airport) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ airport, d }) => ({
      airport,
      distanceKm: Math.round(d / 100) / 10,
      driveMinutes: driveMinutesBetween(point, airport),
    }));
}

export function isFarFromAirports(nearest: readonly NearbyAirport[]): boolean {
  const first = nearest[0];
  return first !== undefined && first.driveMinutes > FAR_FROM_AIRPORT_MINUTES;
}
