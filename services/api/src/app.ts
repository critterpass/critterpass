import { DomainError, type ErrorCode } from '@cp/domain';
import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { requestId, type RequestIdVariables } from 'hono/request-id';
import type pg from 'pg';
import type { Logger } from 'pino';
import { ZodError } from 'zod';

import type { SessionResolver } from './commands/_framework/session';
import { registerGeocodingRoutes, type GeocodingRouteDeps } from './geocoding/routes';
import { NOOP_ERROR_REPORTER, type ErrorReporter } from './obs/sentry';
import { redactLinkPath } from './links/redact';
import type { FoursquareLiveConfig } from './places/live';
import { registerPlacesRoutes } from './places/routes';
import { straightLineRoutingProvider } from './routing/eta';
import type { RoutingProvider } from './routing/provider';
import { registerRoutingRoutes } from './routing/routes';
import { registerHealthRoutes, type ReadinessCheck } from './routes/health';

export interface AppDeps {
  service: string;
  version: string;
  commit: string;
  logger: Logger;
  readiness: Record<string, ReadinessCheck>;
  /** The process has finished starting (`/health` answers 503 until then); absent = started. */
  started?: () => boolean;
  /** Serves the Scalar API reference at /docs (never in production). */
  exposeDocs: boolean;
  /** Absent for services (like media-worker, or future non-DB routes) that never mount DB routes. */
  pool?: pg.Pool;
  /** Server key for Mapbox Geocoding v6 (forward/reverse fallback); geocoding degrades without it. */
  mapboxToken?: string;
  /** The geocoding routes' per-user limit (Redis) and monthly Mapbox call cap; absent = the
   *  routes are not mounted. */
  geocoding?: Pick<
    GeocodingRouteDeps,
    'redis' | 'mapboxMonthlyCap' | 'onMapboxCapReached' | 'onMapboxError'
  >;
  /** Routing for `/v1/routes/*` and place-detail ETAs (Mapbox when a token is configured);
   *  defaults to flagged straight-line estimates. */
  routing?: RoutingProvider;
  /** Public base URL `cp-tiles` serves PMTiles/fonts/sprite from (env.ts `TILES_BASE_URL`); used
   *  by the `/v1/map/regions/{destination_id}` manifest route. */
  tilesBaseUrl?: string;
  /** Foursquare Places API for live place details (`/v1/places/{id}/live`); absent = unavailable. */
  foursquare?: FoursquareLiveConfig;
  /** Sentry: unexpected errors are reported and `INTERNAL` carries `detail.event_id`. */
  errors?: ErrorReporter;
  /** The signed-in session behind a request; the places, map and geocoding routes need one. */
  sessions?: SessionResolver;
}

/** The identity the session middleware sets from the request's Better Auth session (cookie or
 *  bearer); every places/geocoding route requires it and returns AUTH_REQUIRED when absent
 *  (docs/code-standards.md §18: every endpoint authenticated except health/JWKS/webhooks/public
 *  links). */
export interface AuthVariables {
  uid?: string;
  device?: string;
}

export type AppEnv = { Variables: RequestIdVariables & AuthVariables };

/** Wire error body shared by every route (docs/api-contracts.md §1, §3). */
function errorBody(code: string, message: string, retryable: boolean) {
  return { error: { code, message, retryable } };
}

/** Wire codes for the client errors Hono's own middleware throws (malformed JSON is a 400). */
const HTTP_CLIENT_ERROR_CODES: Readonly<Record<number, ErrorCode>> = {
  401: 'AUTH_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
};

/**
 * The wire error for a client mistake Hono raised (malformed JSON, a missing credential), or
 * undefined for anything else. These are the caller's to fix: logged, never reported to Sentry,
 * which only hears about server faults.
 */
export function httpClientError(error: unknown): DomainError | undefined {
  if (!(error instanceof HTTPException) || error.status >= 500) return undefined;
  return new DomainError(
    HTTP_CLIENT_ERROR_CODES[error.status] ?? 'VALIDATION',
    undefined,
    error.message || 'Invalid request',
  );
}

const MAX_BODY_BYTES = 1024 * 1024;
/** Matches env.ts's `TILES_BASE_URL` default (the `cp-tiles` R2 bucket's public `dev-url`). */
const DEFAULT_TILES_BASE_URL = 'https://pub-0cf3d04afb394624afbe8f117d1f198b.r2.dev';

export function createApp(deps: AppDeps) {
  const app = new OpenAPIHono<AppEnv>();

  app.use(requestId());
  app.use(async (c, next) => {
    const startedAt = performance.now();
    await next();
    // Path only: query strings may carry tokens or signatures; link codes in the path are hashed.
    deps.logger.info(
      {
        req_id: c.var.requestId,
        method: c.req.method,
        path: redactLinkPath(c.req.path),
        status: c.res.status,
        ms: Math.round(performance.now() - startedAt),
      },
      'request',
    );
  });
  app.use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json(errorBody('PAYLOAD_TOO_LARGE', 'Request body too large', false), 413),
    }),
  );

  registerHealthRoutes(app, deps);
  const routing = deps.routing ?? straightLineRoutingProvider;
  registerRoutingRoutes(app, { routing });
  if (deps.pool !== undefined) {
    const pool = deps.pool;
    const sessions = deps.sessions;
    if (sessions !== undefined) {
      // Only the routes below read it; the other /v1/places/... routes resolve their own session.
      for (const path of [
        '/v1/places/:id',
        // Two segments after /v1/places/: the one-segment pattern above does not reach them.
        '/v1/places/:id/live',
        '/v1/places/search/live',
        '/v1/places/search/live/resolve',
        '/v1/map/regions/:destination_id',
        '/v1/geocode',
        '/v1/geocode/reverse',
      ]) {
        app.use(path, async (c, next) => {
          const session = await sessions(c.req.raw.headers);
          if (session !== null) {
            c.set('uid', session.uid);
            c.set('device', c.req.header('x-cp-device') ?? 'unknown');
          }
          await next();
        });
      }
    }
    registerPlacesRoutes(app, {
      pool,
      routeEtaProvider: routing,
      tilesBaseUrl: deps.tilesBaseUrl ?? DEFAULT_TILES_BASE_URL,
      ...(deps.foursquare !== undefined ? { foursquare: deps.foursquare } : {}),
      profiles: { redis: deps.geocoding?.redis },
    });
    if (deps.geocoding !== undefined) {
      registerGeocodingRoutes(app, {
        pool,
        ...deps.geocoding,
        ...(deps.mapboxToken !== undefined ? { mapboxToken: deps.mapboxToken } : {}),
      });
    }
  }

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Critterpass API', version: deps.version },
  });
  if (deps.exposeDocs) app.get('/docs', Scalar({ url: '/openapi.json' }));

  app.notFound((c) => c.json(errorBody('NOT_FOUND', 'Not found', false), 404));
  const errors = deps.errors ?? NOOP_ERROR_REPORTER;
  app.onError((error, c) => {
    if (error instanceof DomainError) {
      let body = error.toResponseBody();
      if (error.http >= 500) {
        const eventId = errors.captureInternal(error, { reqId: c.var.requestId });
        deps.logger.error(
          { req_id: c.var.requestId, err: error, code: error.code, event_id: eventId },
          'domain error',
        );
        if (eventId !== undefined) {
          const detail = (body.error.detail ?? {}) as Record<string, unknown>;
          body = { error: { ...body.error, detail: { ...detail, event_id: eventId } } };
        }
      }
      return c.json(body, error.http as Parameters<typeof c.json>[1]);
    }
    if (error instanceof ZodError) {
      return c.json(errorBody('VALIDATION', 'Invalid request', false), 422);
    }
    const clientError = httpClientError(error);
    if (clientError !== undefined) {
      deps.logger.info(
        { req_id: c.var.requestId, code: clientError.code, reason: clientError.message },
        'client error',
      );
      return c.json(clientError.toResponseBody(), clientError.http as Parameters<typeof c.json>[1]);
    }
    const eventId = errors.captureInternal(error, { reqId: c.var.requestId });
    deps.logger.error(
      { req_id: c.var.requestId, err: error, event_id: eventId },
      'unhandled error',
    );
    const body: { error: ReturnType<typeof errorBody>['error'] & { detail?: object } } = errorBody(
      'INTERNAL',
      'Something went wrong',
      true,
    );
    if (eventId !== undefined) body.error.detail = { event_id: eventId };
    return c.json(body, 500);
  });

  return app;
}
