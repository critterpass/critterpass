/**
 * The routing provider the api mounts. Mapbox backs it at launch (./eta.ts); a self-hosted router
 * can replace it by implementing this same interface. Every method resolves (never throws for an
 * outage): when the provider cannot route, the result is a straight-line estimate flagged
 * `estimate: true` with the reason.
 */
import type { RouteEtaInput, RouteEtaProvider, RouteEtaResult, TravelMode } from '@cp/domain';
import type { PlanningTravel } from '@cp/suppliers';

/** Why a result is an estimate (`@cp/domain` routing types). */
export type EstimateReason = NonNullable<RouteEtaResult['estimateReason']>;
/** A closed `[lng, lat]` ring to route around. */
export type ClosureRing = NonNullable<RouteEtaInput['closures']>[number];

export interface LatLngPoint {
  readonly lat: number;
  readonly lng: number;
}

/** Largest matrix the api accepts per side (origins, destinations). */
export const MAX_MATRIX_SIDE = 50;

export interface MatrixInput {
  readonly origins: readonly LatLngPoint[];
  readonly destinations: readonly LatLngPoint[];
  readonly mode: TravelMode;
  readonly departAt?: Date;
}

export interface MatrixResult {
  /** `minutes[i][j]` from origin i to destination j; `null` where no route exists. */
  readonly minutes: readonly (readonly (number | null)[])[];
  readonly distanceM: readonly (readonly (number | null)[])[];
  readonly estimate: boolean;
  readonly estimateReason?: EstimateReason;
  readonly traffic: boolean;
  readonly mode: TravelMode;
  readonly source: RouteEtaResult['source'];
  /** Upstream requests made (the Matrix API caps coordinates per request). */
  readonly requests: number;
}

export interface LeaveByInput {
  readonly origin: LatLngPoint;
  readonly dest: LatLngPoint;
  readonly mode: TravelMode;
  readonly arriveBy: Date;
  readonly closures?: RouteEtaInput['closures'];
}

export interface LeaveByResult {
  readonly leaveAt: Date;
  readonly eta: RouteEtaResult;
}

export interface RoutingProvider extends RouteEtaProvider {
  matrix(input: MatrixInput): Promise<MatrixResult>;
  leaveBy(input: LeaveByInput): Promise<LeaveByResult>;
}

/**
 * Routing by purpose. `live` answers a person looking now (Mapbox with traffic when configured):
 * shown and dropped, never stored. `planning` answers what plans keep, sync and reuse in jobs
 * (`planning-provider.ts`: Valhalla or straight-line, never a Navigation API). A planning caller
 * takes `planning`, whose results carry `storable: true` and no Mapbox source.
 */
export interface RoutingByPurpose {
  readonly live: RoutingProvider;
  readonly planning: PlanningTravel;
}
