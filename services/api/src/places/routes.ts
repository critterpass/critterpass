/**
 * `/v1/places/*` HTTP routes (docs/api-contracts.md §5.5). Every route requires a verified session
 * (Auth "S"); the actual session-verification middleware does not exist yet, so each handler reads
 * `c.var.uid` (set by that future middleware, per `AppEnv` in `../app.ts`) and returns
 * `AUTH_REQUIRED` when it is absent, rather than assuming any particular caller.
 */
import { DomainError, poiCategorySchema, type RouteEtaProvider } from '@cp/domain';
import { withUser } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import { tripStaySource } from '../planning/stay';
import { filterOf, TRIP_SEARCH_PARAMS, tripSearchQuerySchema } from '../planning/search/filters';
import { tripSearch, type TripSearchDeps } from '../planning/search/run';
import { createPlanningProvider } from '../routing/planning-provider';
import { planningFitTravel } from '../routing/travel-modes';

import { getPlaceDetail } from './detail';
import { getPlaceLive, type FoursquareLiveConfig } from './live';
import { registerLiveSearchRoutes } from './live-search-routes';
import { getMapRegionManifest } from './map-regions';
import { createWantedRegionsReader, WANTED_MAX } from './map-regions-wanted';
import { searchPlaces, type PlaceSearchFilters } from './search';

export interface PlacesRouteDeps {
  readonly pool: pg.Pool;
  readonly routeEtaProvider?: RouteEtaProvider;
  /** Public base URL `cp-tiles` serves PMTiles/fonts/sprite from; used by the
   *  `/v1/map/regions/{destination_id}` manifest route. Defaults to the `cp-tiles` public bucket
   *  (env.ts `TILES_BASE_URL`'s own default) so callers that don't care about tiles can omit it. */
  readonly tilesBaseUrl?: string;
  /** Foursquare Places API for `/v1/places/{id}/live`; absent = that route always answers
   *  `available: false`. */
  readonly foursquare?: FoursquareLiveConfig;
  /** `VALHALLA_URL` for plain-words search minutes; read from the process env when not given,
   *  straight-line "about" minutes when unset. */
  readonly valhallaUrl?: string | undefined;
  /** AI place profiles on `GET /v1/places/{id}`: the per-reader limit's Redis and the media
   *  Worker's origin for photo URLs (`MEDIA_PUBLIC_BASE_URL` when not given). Absent = the
   *  answer carries no `profile` and nothing is queued. */
  readonly profiles?: {
    readonly redis?: RateLimitRedisClient | undefined;
    readonly mediaBaseUrl?: string | undefined;
  };
}

const DEFAULT_TILES_BASE_URL = 'https://pub-0cf3d04afb394624afbe8f117d1f198b.r2.dev';

interface RequestActor {
  readonly uid: string;
  readonly device: string;
}

function requireActor(c: { var: { uid?: string; device?: string } }): RequestActor {
  if (c.var.uid === undefined) throw new DomainError('AUTH_REQUIRED');
  return { uid: c.var.uid, device: c.var.device ?? 'unknown' };
}

const nearQuerySchema = z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'must be "lat,lng"');

function parseNear(value: string | undefined): { lat: number; lng: number } | undefined {
  if (value === undefined) return undefined;
  const parsed = nearQuerySchema.parse(value);
  const [lat, lng] = parsed.split(',').map(Number) as [number, number];
  return { lat, lng };
}

const searchQuerySchema = z.object({
  q: z.string().min(1).optional(),
  near: z.string().optional(),
  category: z.string().optional(),
  destination_id: z.uuid().optional(),
  open_at: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

function tripSearchDeps(deps: PlacesRouteDeps): TripSearchDeps {
  const valhallaUrl = 'valhallaUrl' in deps ? deps.valhallaUrl : process.env['VALHALLA_URL'];
  const travel = planningFitTravel(createPlanningProvider({ valhallaUrl, pool: deps.pool }));
  return { travel, fit: { stays: tripStaySource, travel, now: () => new Date() } };
}

export function registerPlacesRoutes(app: OpenAPIHono<AppEnv>, deps: PlacesRouteDeps): void {
  const planned = tripSearchDeps(deps);
  // First: `/v1/places/:id/live` would otherwise take `/v1/places/search/live` for a place id.
  registerLiveSearchRoutes(app, deps);
  app.get('/v1/places/search', async (c) => {
    const actor = requireActor(c);
    const query = searchQuerySchema.parse(c.req.query());
    const category =
      query.category !== undefined ? poiCategorySchema.parse(query.category) : undefined;
    const near = parseNear(query.near);

    const filters: PlaceSearchFilters = {
      ...(query.q !== undefined ? { q: query.q } : {}),
      ...(near !== undefined ? { near } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(query.destination_id !== undefined ? { destinationId: query.destination_id } : {}),
      ...(query.open_at !== undefined ? { openAt: new Date(query.open_at) } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    };

    // Any plain-words parameter switches to trip search; without one the answer is unchanged.
    const raw = c.req.query();
    if (TRIP_SEARCH_PARAMS.some((key) => raw[key] !== undefined)) {
      const trip = tripSearchQuerySchema.parse(raw);
      const response = await withUser(deps.pool, actor.uid, actor.device, (tx) =>
        tripSearch(
          tx,
          {
            filter: filterOf(trip, query.q),
            ...(trip.trip_id === undefined ? {} : { tripId: trip.trip_id }),
            ...(query.destination_id === undefined ? {} : { destinationId: query.destination_id }),
            ...(near === undefined ? {} : { near }),
            ...(category === undefined ? {} : { category }),
            limit: query.limit ?? 20,
            fit: trip.fit === '1',
            relax: trip.relax === '1',
            ...(trip.words === undefined || trip.words === '' ? {} : { words: trip.words }),
          },
          planned,
        ),
      );
      c.header('Cache-Control', 'private, no-store');
      return c.json(response);
    }

    const results = await withUser(deps.pool, actor.uid, actor.device, (tx) =>
      searchPlaces(tx, filters),
    );
    return c.json({ results });
  });

  app.get('/v1/places/:id', async (c) => {
    const actor = requireActor(c);
    const poiId = z.uuid().parse(c.req.param('id'));
    const tripId = c.req.query('trip_id');

    const detail = await withUser(deps.pool, actor.uid, actor.device, (tx) =>
      getPlaceDetail(tx, poiId, {
        ...(tripId !== undefined ? { tripId } : {}),
        ...(deps.routeEtaProvider !== undefined ? { routeEtaProvider: deps.routeEtaProvider } : {}),
        ...(deps.profiles === undefined
          ? {}
          : {
              profile: {
                uid: actor.uid,
                redis: deps.profiles.redis,
                mediaBaseUrl: deps.profiles.mediaBaseUrl ?? process.env['MEDIA_PUBLIC_BASE_URL'],
              },
            }),
      }),
    );
    return c.json(detail);
  });

  // Live Foursquare details, never stored (docs/product-decisions.md D24): `no-store` end to end.
  app.get('/v1/places/:id/live', async (c) => {
    requireActor(c);
    const poiId = z.uuid().parse(c.req.param('id'));
    const live = await getPlaceLive(deps.pool, poiId, deps.foursquare);
    c.header('Cache-Control', 'no-store');
    return c.json(live);
  });

  // No session: slugs and boxes of destinations waiting for a region pack, for the scheduled
  // workflow that builds them. Registered before the manifest route, whose parameter would
  // otherwise take "wanted".
  const wantedRegions = createWantedRegionsReader(deps.pool);
  app.get('/v1/map/regions/wanted', async (c) => {
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(WANTED_MAX)
      .catch(6)
      .parse(c.req.query('limit'));
    const regions = await wantedRegions();
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({ regions: regions.slice(0, limit) });
  });

  app.get('/v1/map/regions/:destination_id', async (c) => {
    const actor = requireActor(c);
    const destinationId = z.uuid().parse(c.req.param('destination_id'));
    const manifest = await withUser(deps.pool, actor.uid, actor.device, (tx) =>
      getMapRegionManifest(tx, destinationId, deps.tilesBaseUrl ?? DEFAULT_TILES_BASE_URL),
    );
    return c.json(manifest);
  });
}
