/**
 * `/v1/routes/*`: single ETAs (docs/api-contracts.md §5.5 `GET /v1/routes/eta`), matrices up to
 * 50x50 and traffic-aware leave-by. Every route requires a session (Auth "S"). Responses carry
 * `estimate` + `estimate_reason` whenever the answer is not a routed path, and Mapbox attribution
 * whenever Mapbox produced it (product terms §1.4.1; ./README.md).
 */
import { DomainError, type RouteEtaResult } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

import type { AppEnv } from '../app';

import { TRAVEL_TO_WIRE_MODE, WIRE_MODES, WIRE_TO_TRAVEL_MODE } from './modes';
import { MAX_MATRIX_SIDE, type MatrixResult, type RoutingProvider } from './provider';

export interface RoutingRouteDeps {
  readonly routing: RoutingProvider;
}

/** Mandatory wherever Mapbox routing results are shown (Mapbox product terms §1.4.1). */
export const MAPBOX_ATTRIBUTION = [
  { label: '© Mapbox', url: 'https://www.mapbox.com/about/maps' },
  { label: '© OpenStreetMap', url: 'https://www.openstreetmap.org/about' },
] as const;

function requireSession(c: { var: { uid?: string } }): void {
  if (c.var.uid === undefined) throw new DomainError('AUTH_REQUIRED');
}

const latLngQuery = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'must be "lat,lng"')
  .transform((value) => {
    const [lat, lng] = value.split(',').map(Number) as [number, number];
    return { lat, lng };
  })
  .pipe(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }));

const latLngBody = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
/** Closure rings as JSON `[[[lng, lat], ...], ...]`; kept small so the query stays URL-sized. */
const closuresQuery = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'closures must be JSON' });
      return z.NEVER;
    }
  })
  .pipe(z.array(z.array(position).min(4).max(100)).min(1).max(5));

const modeSchema = z.enum(WIRE_MODES);
const isoDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

const etaQuery = z.object({
  from: latLngQuery,
  to: latLngQuery,
  mode: modeSchema,
  depart_at: isoDate.optional(),
  closures: closuresQuery.optional(),
});

const leaveByQuery = etaQuery.omit({ depart_at: true }).extend({ arrive_by: isoDate });

const matrixBody = z.object({
  origins: z.array(latLngBody).min(1).max(MAX_MATRIX_SIDE),
  destinations: z.array(latLngBody).min(1).max(MAX_MATRIX_SIDE),
  mode: modeSchema,
  depart_at: isoDate.optional(),
});

function provenance(result: Pick<MatrixResult, 'estimate' | 'estimateReason' | 'source'>) {
  return {
    estimate: result.estimate,
    ...(result.estimateReason !== undefined ? { estimate_reason: result.estimateReason } : {}),
    source: result.source,
    ...(result.source === 'mapbox' ? { attribution: MAPBOX_ATTRIBUTION } : {}),
  };
}

function etaBody(result: RouteEtaResult) {
  return {
    minutes: result.minutes,
    distance_m: result.distanceM,
    traffic: result.traffic,
    mode: TRAVEL_TO_WIRE_MODE[result.mode],
    ...provenance(result),
  };
}

export function registerRoutingRoutes(app: OpenAPIHono<AppEnv>, deps: RoutingRouteDeps): void {
  app.get('/v1/routes/eta', async (c) => {
    requireSession(c);
    const query = etaQuery.parse(c.req.query());
    const result = await deps.routing.eta({
      originLat: query.from.lat,
      originLng: query.from.lng,
      destLat: query.to.lat,
      destLng: query.to.lng,
      mode: WIRE_TO_TRAVEL_MODE[query.mode],
      ...(query.depart_at !== undefined ? { departAt: query.depart_at } : {}),
      ...(query.closures !== undefined ? { closures: query.closures } : {}),
    });
    return c.json(etaBody(result));
  });

  app.get('/v1/routes/leave-by', async (c) => {
    requireSession(c);
    const query = leaveByQuery.parse(c.req.query());
    const result = await deps.routing.leaveBy({
      origin: query.from,
      dest: query.to,
      mode: WIRE_TO_TRAVEL_MODE[query.mode],
      arriveBy: query.arrive_by,
      ...(query.closures !== undefined ? { closures: query.closures } : {}),
    });
    return c.json({ leave_at: result.leaveAt.toISOString(), ...etaBody(result.eta) });
  });

  app.post('/v1/routes/matrix', async (c) => {
    requireSession(c);
    const body = matrixBody.parse(await c.req.json());
    const result = await deps.routing.matrix({
      origins: body.origins,
      destinations: body.destinations,
      mode: WIRE_TO_TRAVEL_MODE[body.mode],
      ...(body.depart_at !== undefined ? { departAt: body.depart_at } : {}),
    });
    return c.json({
      minutes: result.minutes,
      distance_m: result.distanceM,
      traffic: result.traffic,
      mode: TRAVEL_TO_WIRE_MODE[result.mode],
      ...provenance(result),
    });
  });
}
