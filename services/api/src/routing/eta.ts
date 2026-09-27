/**
 * The Mapbox-backed `RoutingProvider`: single ETAs on Directions, matrices on the Matrix API
 * (./matrix.ts), traffic-aware leave-by on `driving-traffic`. Transit, outages, timeouts and
 * "no route" answers resolve to straight-line estimates flagged with the reason. Results are never
 * cached or stored: Mapbox's product terms forbid it for navigation results (./README.md).
 */
import { estimateStraightLineEta, type RouteEtaInput, type RouteEtaResult } from '@cp/domain';

import { closureExcludePoints } from './closures';
import { fallbackMatrix } from './fallback';
import { NoRouteError, RoutingUnavailableError, type MapboxRoutingClient } from './mapbox';
import { runMapboxMatrix } from './matrix';
import { mapboxProfileFor } from './modes';
import type {
  EstimateReason,
  LeaveByInput,
  LeaveByResult,
  MatrixInput,
  MatrixResult,
  RoutingProvider,
} from './provider';

export interface MapboxRoutingProviderOptions {
  readonly client: MapboxRoutingClient;
  /** Reports outages (logged by the app); the caller still gets a flagged estimate. */
  readonly onProviderError?: (error: Error) => void;
  readonly now?: () => Date;
}

/** Whole minutes, at least 1 for any real trip; a zero-length trip stays 0. */
function toMinutes(seconds: number): number {
  return seconds === 0 ? 0 : Math.max(1, Math.round(seconds / 60));
}

/** `depart_at` must be in the future; anything else routes on live traffic. */
function futureOrUndefined(date: Date | undefined, now: Date): Date | undefined {
  return date !== undefined && date.getTime() > now.getTime() ? date : undefined;
}

function reasonFor(error: unknown): EstimateReason | undefined {
  if (error instanceof RoutingUnavailableError) return 'provider_unavailable';
  if (error instanceof NoRouteError) return 'no_route';
  return undefined;
}

export function createMapboxRoutingProvider(
  options: MapboxRoutingProviderOptions,
): RoutingProvider {
  const now = options.now ?? (() => new Date());

  const degrade = <T>(error: unknown, fallback: (reason: EstimateReason) => T): T => {
    const reason = reasonFor(error);
    if (reason === undefined) throw error;
    if (reason === 'provider_unavailable') options.onProviderError?.(error as Error);
    return fallback(reason);
  };

  async function eta(input: RouteEtaInput): Promise<RouteEtaResult> {
    const profile = mapboxProfileFor(input.mode);
    if (profile === undefined) return estimateStraightLineEta(input, 'transit_unsupported');
    const departAt = futureOrUndefined(input.departAt, now());
    const drivingProfile = profile === 'driving-traffic';
    // Point exclusions only work on the driving profiles; walking/cycling ignore closures.
    const excludePoints =
      drivingProfile && input.closures !== undefined ? closureExcludePoints(input.closures) : [];
    try {
      const route = await options.client.directions({
        profile,
        origin: { lng: input.originLng, lat: input.originLat },
        dest: { lng: input.destLng, lat: input.destLat },
        ...(departAt !== undefined && drivingProfile ? { departAt } : {}),
        ...(excludePoints.length > 0 ? { excludePoints } : {}),
      });
      return {
        minutes: toMinutes(route.durationS),
        distanceM: Math.round(route.distanceM),
        estimate: false,
        traffic: drivingProfile,
        mode: input.mode,
        source: 'mapbox',
      };
    } catch (error) {
      return degrade(error, (reason) => estimateStraightLineEta(input, reason));
    }
  }

  async function matrix(input: MatrixInput): Promise<MatrixResult> {
    const departAt = futureOrUndefined(input.departAt, now());
    try {
      const output = await runMapboxMatrix(
        options.client,
        input.origins,
        input.destinations,
        input.mode,
        departAt,
      );
      if (output === undefined) return fallbackMatrix(input, 'transit_unsupported');
      return {
        minutes: output.durationsS.map((row) =>
          row.map((value) => (value === null ? null : toMinutes(value))),
        ),
        distanceM: output.distancesM.map((row) =>
          row.map((value) => (value === null ? null : Math.round(value))),
        ),
        estimate: false,
        traffic: output.traffic,
        mode: input.mode,
        source: 'mapbox',
        requests: output.requests,
      };
    } catch (error) {
      return degrade(error, (reason) => fallbackMatrix(input, reason));
    }
  }

  /**
   * Latest departure that still arrives by `arriveBy`: one ETA at the provisional departure time,
   * then a second at the corrected time so predicted traffic matches when the trip actually runs.
   */
  async function leaveBy(input: LeaveByInput): Promise<LeaveByResult> {
    const base: RouteEtaInput = {
      originLat: input.origin.lat,
      originLng: input.origin.lng,
      destLat: input.dest.lat,
      destLng: input.dest.lng,
      mode: input.mode,
      ...(input.closures !== undefined ? { closures: input.closures } : {}),
    };
    const minutesBefore = (minutes: number) =>
      new Date(input.arriveBy.getTime() - minutes * 60_000);
    const provisional = estimateStraightLineEta(base);
    const first = await eta({ ...base, departAt: minutesBefore(provisional.minutes) });
    const second = first.estimate
      ? first
      : await eta({ ...base, departAt: minutesBefore(first.minutes) });
    return { leaveAt: minutesBefore(second.minutes), eta: second };
  }

  return { eta, matrix, leaveBy };
}

/** Used when no Mapbox token is configured: every answer is a flagged straight-line estimate. */
export const straightLineRoutingProvider: RoutingProvider = {
  eta: (input) => Promise.resolve(estimateStraightLineEta(input, 'provider_not_configured')),
  matrix: (input) => Promise.resolve(fallbackMatrix(input, 'provider_not_configured')),
  leaveBy: (input) => {
    const result = estimateStraightLineEta(
      {
        originLat: input.origin.lat,
        originLng: input.origin.lng,
        destLat: input.dest.lat,
        destLng: input.dest.lng,
        mode: input.mode,
      },
      'provider_not_configured',
    );
    return Promise.resolve({
      leaveAt: new Date(input.arriveBy.getTime() - result.minutes * 60_000),
      eta: result,
    });
  },
};
