/**
 * `/v1/geocode` and `/v1/geocode/reverse` (docs/api-contracts.md §5.5): forward checks our own
 * `pois` + `cities` first, falling back to Mapbox only when neither has a trigram-similar match and
 * a token is configured; reverse never calls Mapbox at all — nearest POI within 60 m, else the
 * nearest `cities` locality.
 */
import { DomainError } from '@cp/domain';
import { geocodeForwardLocal, withUser, type GeocodeResult } from '@cp/db';
import { geocodeForwardMapbox, type MapboxHttpClient } from '@cp/suppliers';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';

export interface GeocodingRouteDeps {
  readonly pool: pg.Pool;
  readonly mapboxToken?: string;
  /** Mapbox's HTTP boundary; the global `fetch` unless a test replays recorded answers. */
  readonly mapboxHttp?: MapboxHttpClient;
}

interface RequestActor {
  readonly uid: string;
  readonly device: string;
}

function requireActor(c: { var: { uid?: string; device?: string } }): RequestActor {
  if (c.var.uid === undefined) throw new DomainError('AUTH_REQUIRED');
  return { uid: c.var.uid, device: c.var.device ?? 'unknown' };
}

/** Reverse-geocode search radius: nearest POI within 60 m (visit-detection radius, not the venue's own footprint). */
const REVERSE_POI_RADIUS_M = 60;
/** Beyond this, "nearest city" stops being a meaningful locality answer for a reverse lookup. */
const REVERSE_CITY_RADIUS_M = 100_000;

export interface ReverseGeocodeResult {
  readonly source: 'poi' | 'city' | 'none';
  readonly label?: string;
  readonly poiId?: string;
  readonly cityId?: string;
  readonly distanceM?: number;
}

async function reverseGeocodeLocal(
  tx: pg.PoolClient,
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult> {
  const nearestPoi = await tx.query<{ id: string; name: string; distance_m: number }>(
    `SELECT id, name, ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_m
     FROM pois WHERE status = 'active'
     AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
     ORDER BY location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography LIMIT 1`,
    [lng, lat, REVERSE_POI_RADIUS_M],
  );
  const poi = nearestPoi.rows[0];
  if (poi !== undefined && poi.distance_m <= REVERSE_POI_RADIUS_M) {
    return { source: 'poi', label: poi.name, poiId: poi.id, distanceM: poi.distance_m };
  }

  const nearestCity = await tx.query<{
    id: string;
    name: string;
    country: string;
    distance_m: number;
  }>(
    `SELECT id, name, country, ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_m
     FROM cities
     WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
     ORDER BY location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography LIMIT 1`,
    [lng, lat, REVERSE_CITY_RADIUS_M],
  );
  const city = nearestCity.rows[0];
  if (city !== undefined) {
    return {
      source: 'city',
      label: `${city.name}, ${city.country}`,
      cityId: city.id,
      distanceM: city.distance_m,
    };
  }

  return { source: 'none' };
}

export function registerGeocodingRoutes(app: OpenAPIHono<AppEnv>, deps: GeocodingRouteDeps): void {
  app.get('/v1/geocode', async (c) => {
    const actor = requireActor(c);
    const query = z.string().min(1).parse(c.req.query('q'));

    const localResults = await withUser(deps.pool, actor.uid, actor.device, (tx) =>
      geocodeForwardLocal(tx, query),
    );
    if (localResults.length > 0 || deps.mapboxToken === undefined) {
      return c.json({ results: localResults });
    }

    const mapboxResults = await geocodeForwardMapbox(
      query,
      { accessToken: deps.mapboxToken },
      deps.mapboxHttp,
    );
    return c.json({
      results: mapboxResults.map((result): GeocodeResult => ({
        source: 'mapbox',
        label: result.formattedAddress,
        lat: result.lat,
        lng: result.lng,
      })),
    });
  });

  app.get('/v1/geocode/reverse', async (c) => {
    const actor = requireActor(c);
    const lat = z.coerce.number().min(-90).max(90).parse(c.req.query('lat'));
    const lng = z.coerce.number().min(-180).max(180).parse(c.req.query('lng'));

    const result = await withUser(deps.pool, actor.uid, actor.device, (tx) =>
      reverseGeocodeLocal(tx, lat, lng),
    );
    return c.json(result);
  });
}
