/**
 * The leave-by's router, behind `@cp/domain`'s `RouteEtaProvider` port (the one the api's
 * `/v1/routes/eta` serves): Mapbox Directions `driving-traffic` with `depart_at` when `MAPBOX_TOKEN`
 * is set, so the time reflects predicted traffic; otherwise, or when Mapbox cannot answer, a
 * straight-line estimate flagged `estimate: true` (the day-of screen says "without live traffic").
 * Results are used once and never cached (Mapbox product terms).
 */
import {
  estimateStraightLineEta,
  type RouteEtaInput,
  type RouteEtaProvider,
  type RouteEtaResult,
} from '@cp/domain';
import { z } from 'zod';

const TIMEOUT_MS = 5_000;

const directionsSchema = z.object({
  code: z.string(),
  routes: z.array(z.object({ duration: z.number(), distance: z.number() })).optional(),
});

export interface MapboxLeaveByRouterOptions {
  readonly accessToken: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly onError?: (error: unknown) => void;
}

const coordinate = (lng: number, lat: number) => `${lng.toFixed(6)},${lat.toFixed(6)}`;

export function mapboxLeaveByRouter(options: MapboxLeaveByRouterOptions): RouteEtaProvider {
  const http = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  return {
    async eta(input: RouteEtaInput): Promise<RouteEtaResult> {
      // Only driving has traffic; everything else is an honest estimate.
      if (input.mode !== 'auto' && input.mode !== 'motor_scooter') {
        return estimateStraightLineEta(input, 'transit_unsupported');
      }
      const params = new URLSearchParams({
        alternatives: 'false',
        geometries: 'geojson',
        overview: 'simplified',
        steps: 'false',
      });
      if (input.departAt !== undefined && input.departAt.getTime() > now().getTime()) {
        params.set('depart_at', `${input.departAt.toISOString().slice(0, 19)}Z`);
      }
      const path =
        `/directions/v5/mapbox/driving-traffic/` +
        `${coordinate(input.originLng, input.originLat)};${coordinate(input.destLng, input.destLat)}`;
      const url = `${options.baseUrl ?? 'https://api.mapbox.com'}${path}?${params.toString()}`;
      try {
        const response = await http(`${url}&access_token=${options.accessToken}`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`mapbox directions answered ${response.status}`);
        const body = directionsSchema.parse(await response.json());
        const route = body.routes?.[0];
        if (body.code !== 'Ok' || route === undefined) {
          return estimateStraightLineEta(input, 'no_route');
        }
        return {
          minutes: route.duration === 0 ? 0 : Math.max(1, Math.round(route.duration / 60)),
          distanceM: Math.round(route.distance),
          estimate: false,
          traffic: true,
          mode: input.mode,
          source: 'mapbox',
        };
      } catch (error) {
        options.onError?.(error instanceof Error ? new Error(error.message) : error);
        return estimateStraightLineEta(input, 'provider_unavailable');
      }
    },
  };
}

/** No routing configured: every leave-by travel time is a flagged straight-line estimate. */
export const straightLineLeaveByRouter: RouteEtaProvider = {
  eta: (input) => Promise.resolve(estimateStraightLineEta(input, 'provider_not_configured')),
};
