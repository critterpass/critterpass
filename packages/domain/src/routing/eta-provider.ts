/**
 * The routing interface place detail and the `route_eta` API both call. The api implements it with
 * Mapbox Directions (`services/api/src/routing/`); `./straight-line-eta.ts` is the fallback every
 * provider degrades to, always flagged `estimate: true` with the reason.
 */

export const TRAVEL_MODES = ['pedestrian', 'motor_scooter', 'auto', 'multimodal'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

/** A closed ring of `[lng, lat]` positions (GeoJSON order) the route should avoid. */
export type ClosureRing = readonly (readonly [number, number])[];

/** Why a result is an estimate rather than a routed path. */
export type EstimateReason =
  'transit_unsupported' | 'provider_unavailable' | 'provider_not_configured' | 'no_route';

export interface RouteEtaInput {
  readonly originLat: number;
  readonly originLng: number;
  readonly destLat: number;
  readonly destLng: number;
  readonly mode: TravelMode;
  readonly departAt?: Date;
  /** Areas to route around (road closures); providers honour them as far as their API allows. */
  readonly closures?: readonly ClosureRing[];
}

export interface RouteEtaResult {
  readonly minutes: number;
  readonly distanceM: number;
  /** True whenever the value is a straight-line approximation, not a routed path. */
  readonly estimate: boolean;
  /** Present whenever `estimate` is true. */
  readonly estimateReason?: EstimateReason;
  /** True when the duration reflects live or predicted traffic. */
  readonly traffic: boolean;
  readonly mode: TravelMode;
  readonly source: 'valhalla' | 'mapbox' | 'straight_line';
}

export interface RouteEtaProvider {
  eta(input: RouteEtaInput): Promise<RouteEtaResult>;
}
