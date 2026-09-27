/**
 * The routing fallback every ETA path uses when a real router is unreachable, or not built yet:
 * straight-line distance x mode factor + a fixed buffer, always flagged `estimate: true`. The real
 * Valhalla/Mapbox providers implement the same `RouteEtaProvider` interface and fall back to this
 * same function whenever Valhalla itself is down.
 */
import type { RouteEtaInput, RouteEtaProvider, RouteEtaResult, TravelMode } from './eta-provider';

const EARTH_RADIUS_M = 6_371_000;

/** Real routes are never a straight line; a fixed detour multiplier keeps the estimate conservative. */
const DETOUR_FACTOR = 1.35;
const BUFFER_MINUTES = 3;

const MODE_SPEED_KMH: Readonly<Record<TravelMode, number>> = {
  pedestrian: 4.5,
  motor_scooter: 25,
  auto: 28,
  // No specific transit line to route on for a straight-line estimate; a conservative walk+wait
  // average stands in until a real GTFS-aware multimodal router replaces it.
  multimodal: 18,
};

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function haversineDistanceM(
  a: { readonly lat: number; readonly lng: number },
  b: { readonly lat: number; readonly lng: number },
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function estimateStraightLineEta(input: RouteEtaInput): RouteEtaResult {
  const straightLineM = haversineDistanceM(
    { lat: input.originLat, lng: input.originLng },
    { lat: input.destLat, lng: input.destLng },
  );
  const distanceM = straightLineM * DETOUR_FACTOR;
  const speedKmh = MODE_SPEED_KMH[input.mode];
  const minutes = Math.round((distanceM / 1000 / speedKmh) * 60 + BUFFER_MINUTES);
  return {
    minutes,
    distanceM: Math.round(distanceM),
    estimate: true,
    mode: input.mode,
    source: 'straight_line',
  };
}

export const straightLineEtaProvider: RouteEtaProvider = {
  eta: (input) => Promise.resolve(estimateStraightLineEta(input)),
};
