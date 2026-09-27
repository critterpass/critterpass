/**
 * The routing interface place detail and the `route_eta` API both call. A Valhalla + Mapbox traffic
 * provider (not built yet) will add a real implementation behind this same shape in
 * `services/api/src/routing/`; place detail only needs the straight-line fallback
 * (`./straight-line-eta.ts`) for now.
 */

export const TRAVEL_MODES = ['pedestrian', 'motor_scooter', 'auto', 'multimodal'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

export interface RouteEtaInput {
  readonly originLat: number;
  readonly originLng: number;
  readonly destLat: number;
  readonly destLng: number;
  readonly mode: TravelMode;
  readonly departAt?: Date;
}

export interface RouteEtaResult {
  readonly minutes: number;
  readonly distanceM: number;
  /** True whenever the value is a straight-line approximation, not a routed path. */
  readonly estimate: boolean;
  readonly mode: TravelMode;
  readonly source: 'valhalla' | 'mapbox' | 'straight_line';
}

export interface RouteEtaProvider {
  eta(input: RouteEtaInput): Promise<RouteEtaResult>;
}
