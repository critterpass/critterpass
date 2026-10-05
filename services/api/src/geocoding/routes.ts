/**
 * `/v1/geocode` and `/v1/geocode/reverse` (docs/api-contracts.md §5.5). Forward answers from our own
 * `pois` + `cities` first and asks Mapbox (permanent mode) only when nothing of ours matches or the
 * text reads like a street address, a token is configured and the month's call cap has room; at
 * the cap, or when Mapbox fails beside matches of our own, it answers from our data alone. Mapbox
 * answers carry its attribution (product terms §1.4.1; ../routing/README.md). Reverse never calls
 * Mapbox at all: nearest POI within 60 m, else the nearest `cities` locality.
 */
import { DomainError } from '@cp/domain';
import { geocodeForwardLocal, withSystem, withUser, type GeocodeResult } from '@cp/db';
import { geocodeForwardMapbox, type MapboxHttpClient } from '@cp/suppliers';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { RateLimitRedisClient, RateLimitRule } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import { enforceUidRateLimit } from '../commands/_framework/session';
import { MAPBOX_ATTRIBUTION } from '../routing/routes';

import { looksLikeAddress } from './address-text';

/** A person typing with pauses stays far under this; a script does not. */
const LOOKUPS_PER_UID_RULE: RateLimitRule = { windowSeconds: 60, max: 30 };
export const DEFAULT_MAPBOX_GEOCODE_MONTHLY_CAP = 2000;
/** With a `near` point the caller wants somewhere to stand: streets and house numbers only. */
const ADDRESS_FEATURE_TYPES = ['address', 'street'] as const;
/**
 * With a `near` point, an address further than this is not an answer: Mapbox only leans towards
 * the point, so a street it does not know in Ubud comes back as its namesake in another country.
 */
export const ADDRESS_REACH_KM = 300;
/**
 * How long our own lookup may take when the caller is after an address: it searches every place
 * we hold by name, which on a full catalogue can outlast the app's patience for the whole answer.
 */
const LOCAL_LOOKUP_BUDGET_MS = 2500;

/** Whether `point` lies within `ADDRESS_REACH_KM` of `near`. */
export function withinReach(
  near: { readonly lat: number; readonly lng: number },
  point: { readonly lat: number; readonly lng: number },
): boolean {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((point.lat - near.lat) * rad) / 2) ** 2 +
    Math.cos(near.lat * rad) *
      Math.cos(point.lat * rad) *
      Math.sin(((point.lng - near.lng) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) <= ADDRESS_REACH_KM;
}

/** Our own matches, or none when the lookup outlasts its budget (the address search goes on). */
async function localWithinBudget(tx: pg.PoolClient, query: string): Promise<GeocodeResult[]> {
  await tx.query('SAVEPOINT local_lookup');
  try {
    await tx.query(`SET LOCAL statement_timeout = ${String(LOCAL_LOOKUP_BUDGET_MS)}`);
    const found = [...(await geocodeForwardLocal(tx, query))];
    await tx.query('RELEASE SAVEPOINT local_lookup');
    return found;
  } catch (error) {
    // 57014: cancelled by the statement timeout.
    if ((error as { code?: unknown }).code !== '57014') throw error;
    await tx.query('ROLLBACK TO SAVEPOINT local_lookup');
    return [];
  }
}

export interface GeocodingRouteDeps {
  readonly pool: pg.Pool;
  readonly mapboxToken?: string;
  /** Mapbox's HTTP boundary; the global `fetch` unless a test replays recorded answers. */
  readonly mapboxHttp?: MapboxHttpClient;
  /** Per-user lookup limit on the forward route. */
  readonly redis: RateLimitRedisClient;
  readonly rateLimit?: RateLimitRule;
  /** Mapbox calls per UTC month (`app.reserve_mapbox_geocode_call`); 2,000 unless set. */
  readonly mapboxMonthlyCap?: number;
  readonly onMapboxCapReached?: () => void;
  readonly onMapboxError?: (error: unknown) => void;
}

const forwardQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  near: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    .transform((text) => {
      const [lat, lng] = text.split(',').map(Number) as [number, number];
      return { lat, lng };
    })
    .refine((point) => Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180)
    .optional(),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

async function reserveMapboxCall(pool: pg.Pool, cap: number): Promise<boolean> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ ok: boolean }>(
      'SELECT app.reserve_mapbox_geocode_call($1) AS ok',
      [cap],
    );
    return rows[0]?.ok === true;
  });
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
    await enforceUidRateLimit(
      deps.redis,
      'geocode',
      actor.uid,
      deps.rateLimit ?? LOOKUPS_PER_UID_RULE,
    );
    const parsed = forwardQuerySchema.safeParse(c.req.query());
    if (!parsed.success) throw new DomainError('VALIDATION', { reason: 'bad_geocode_query' });
    const { q: query, near, limit } = parsed.data;

    const address = looksLikeAddress(query);
    const localResults = await withUser(deps.pool, actor.uid, actor.device, (tx) =>
      address && near !== undefined ? localWithinBudget(tx, query) : geocodeForwardLocal(tx, query),
    );
    const wantsMapbox = localResults.length === 0 || address;
    if (!wantsMapbox || deps.mapboxToken === undefined) return c.json({ results: localResults });

    const cap = deps.mapboxMonthlyCap ?? DEFAULT_MAPBOX_GEOCODE_MONTHLY_CAP;
    if (!(await reserveMapboxCall(deps.pool, cap))) {
      deps.onMapboxCapReached?.();
      return c.json({ results: localResults });
    }

    let mapboxResults: readonly GeocodeResult[];
    try {
      const found = await geocodeForwardMapbox(
        query,
        { accessToken: deps.mapboxToken },
        deps.mapboxHttp,
        {
          ...(near !== undefined ? { proximity: near, types: ADDRESS_FEATURE_TYPES } : {}),
          ...(limit !== undefined ? { limit } : {}),
        },
      );
      mapboxResults = found
        .filter((result) => result.formattedAddress !== '')
        .filter((result) => near === undefined || withinReach(near, result))
        .map((result) => ({
          source: 'mapbox',
          label: result.formattedAddress,
          lat: result.lat,
          lng: result.lng,
        }));
    } catch (error) {
      // Our own matches still answer the search; with none, the failure is the answer.
      if (localResults.length === 0) throw error;
      deps.onMapboxError?.(error);
      return c.json({ results: localResults });
    }
    if (mapboxResults.length === 0) return c.json({ results: localResults });
    return c.json({
      results: [...localResults, ...mapboxResults],
      attribution: MAPBOX_ATTRIBUTION,
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
