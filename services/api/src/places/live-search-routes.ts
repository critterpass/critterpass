/**
 * The live Foursquare search routes (docs/api-contracts.md §5.5): `GET /v1/places/search/live`
 * and `GET /v1/places/search/live/resolve`. Both answer `Cache-Control: no-store`: the search
 * carries Foursquare content we may not keep, and the resolve answer changes as ingest lands.
 * Registered before `/v1/places/:id/live`, which would otherwise read "search" as a place id.
 */
import { DomainError } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';

import type { FoursquareLiveConfig } from './live';
import { liveResolveQuerySchema, resolveLivePlace } from './live-resolve';
import { searchPlacesLive } from './live-search';

export interface LiveSearchRouteDeps {
  readonly pool: pg.Pool;
  readonly foursquare?: FoursquareLiveConfig;
}

const NEAR_PATTERN = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

const liveQuerySchema = z.object({
  q: z.string().min(1).max(200),
  destination_id: z.uuid().optional(),
  near: z.string().regex(NEAR_PATTERN, 'must be "lat,lng"').optional(),
});

function requireUser(c: { var: { uid?: string; device?: string } }) {
  if (c.var.uid === undefined) throw new DomainError('AUTH_REQUIRED');
  return { uid: c.var.uid, device: c.var.device ?? 'unknown' };
}

export function registerLiveSearchRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: LiveSearchRouteDeps,
): void {
  app.get('/v1/places/search/live', async (c) => {
    const actor = requireUser(c);
    const query = liveQuerySchema.parse(c.req.query());
    const near =
      query.near === undefined
        ? undefined
        : (() => {
            const [lat, lng] = query.near.split(',').map(Number) as [number, number];
            return { lat, lng };
          })();
    const live = await searchPlacesLive(
      deps.pool,
      {
        ...actor,
        q: query.q,
        ...(query.destination_id === undefined ? {} : { destinationId: query.destination_id }),
        ...(near === undefined ? {} : { near }),
      },
      deps.foursquare,
    );
    c.header('Cache-Control', 'no-store');
    return c.json(live);
  });

  app.get('/v1/places/search/live/resolve', async (c) => {
    requireUser(c);
    const query = liveResolveQuerySchema.parse(c.req.query());
    const result = await resolveLivePlace(
      deps.pool,
      { fsqPlaceId: query.fsq_place_id, destinationId: query.destination_id },
      deps.foursquare,
    );
    c.header('Cache-Control', 'no-store');
    return c.json(result);
  });
}
