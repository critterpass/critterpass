/**
 * `POST /v1/routes/preview` (docs/api-contracts.md §5.5): the GO preview's walk and drive route
 * from the phone's position to a place. Session required, 60 an hour per user. The position comes
 * in the body, never a query string (the request log keeps the path only), is routed once and
 * dropped: it is not stored, cached or logged. With `trip_id`, drive minutes carry that trip's
 * destination drive factor, read as the caller (someone else's trip reads as factor 1).
 */
import { withUser } from '@cp/db';
import { ValhallaError } from '@cp/suppliers';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import {
  enforceUidRateLimit,
  requireCommandSession,
  type SessionResolver,
} from '../commands/_framework/session';
import type { PlanningModule } from '../planning/register';
import { previewRoute, type PreviewRouter } from './preview';
import { apiValhalla } from './valhalla';

export const ROUTE_PREVIEW_PER_UID_RULE = { windowSeconds: 3600, max: 60 };

const point = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const routePreviewBody = z.strictObject({
  from: point,
  to: point,
  trip_id: z.uuid().optional(),
});

export interface RoutePreviewDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  readonly router: PreviewRouter | null;
  /** Gets the failure kind only, never the request. */
  readonly onFallback?: (kind: string) => void;
}

async function driveFactor(pool: pg.Pool, uid: string, tripId: string | undefined) {
  if (tripId === undefined) return 1;
  const { rows } = await withUser(pool, uid, 'unknown', (tx) =>
    tx.query<{ drive_factor: number | null }>(
      `SELECT d.drive_factor FROM trips t JOIN destinations d ON d.id = t.destination_id
        WHERE t.id = $1`,
      [tripId],
    ),
  );
  return rows[0]?.drive_factor ?? 1;
}

export function registerRoutePreviewRoute(app: OpenAPIHono<AppEnv>, deps: RoutePreviewDeps): void {
  app.post('/v1/routes/preview', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(
      deps.redis,
      'routes-preview',
      session.uid,
      ROUTE_PREVIEW_PER_UID_RULE,
    );
    const body = routePreviewBody.parse(await c.req.json());
    const factor = await driveFactor(deps.pool, session.uid, body.trip_id);
    const preview = await previewRoute(
      deps.router,
      { from: body.from, to: body.to, driveFactor: factor },
      (error) => deps.onFallback?.(error instanceof ValhallaError ? error.kind : 'unknown'),
    );
    c.header('Cache-Control', 'private, no-store');
    return c.json(preview);
  });
}

export const routePreviewModule: PlanningModule = ({ app, doors, env }) => {
  registerRoutePreviewRoute(app, {
    pool: doors.pool,
    sessions: doors.sessions,
    redis: doors.redis,
    router: apiValhalla(env.VALHALLA_URL),
    onFallback: (kind) => doors.logger.warn({ kind }, 'route preview fell back to straight line'),
  });
};
