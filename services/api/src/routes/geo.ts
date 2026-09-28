/**
 * `GET /v1/geo/hint` (docs/api-contracts.md §5.5): the caller's country, city and nearest airports
 * from their IP address, for the home-airport step (3a-5). No GPS, no permission prompt: the IP is
 * looked up in DB-IP's IP to City Lite database (CC BY 4.0, attributed on the legal page) held in
 * memory, and only the city centre (rounded to 0.1°) and its nearest airports leave the server.
 *
 * The database loads once at boot from `GEOIP_CITY_MMDB` (a file path, or an https URL to a `.mmdb`
 * or `.mmdb.gz`). Until it has loaded, or when it is not configured, every field is null and the
 * app hides the "nearest" row.
 */
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { gunzipSync } from 'node:zlib';

import { airportDataset } from '@cp/content/airports';
import { nearestAirports, type GeoHint } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { Reader, type CityResponse } from 'mmdb-lib';
import type { Logger } from 'pino';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import {
  enforceUidRateLimit,
  requireCommandSession,
  type SessionResolver,
} from '../commands/_framework/session';

/** One IP's place, city-level at best. */
export interface GeoIpRecord {
  readonly country: string | null;
  readonly city: string | null;
  readonly point: { readonly lat: number; readonly lng: number } | null;
}

export interface GeoIpLookup {
  lookup(ip: string): GeoIpRecord | null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** A lookup over an in-memory MaxMind-format database (DB-IP Lite City uses the same layout). */
export function mmdbGeoLookup(database: Buffer): GeoIpLookup {
  const reader = new Reader<CityResponse>(database);
  return {
    lookup(ip) {
      if (isIP(ip) === 0) return null;
      const found = reader.get(ip);
      if (found === null) return null;
      const country = found.country?.iso_code ?? null;
      const { latitude, longitude } = found.location ?? {};
      return {
        country: country !== null && /^[A-Z]{2}$/u.test(country) ? country : null,
        city: found.city?.names.en?.slice(0, 80) ?? null,
        point:
          latitude === undefined || longitude === undefined
            ? null
            : { lat: round1(latitude), lng: round1(longitude) },
      };
    },
  };
}

/** Reads the database from a path or an https URL, gunzipping a `.gz` body. */
export async function loadGeoIpDatabase(
  source: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeoIpLookup> {
  let bytes: Buffer;
  if (/^https:\/\//u.test(source)) {
    const response = await fetchImpl(source);
    if (!response.ok) throw new Error(`geo database download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  } else {
    bytes = await readFile(source);
  }
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  return mmdbGeoLookup(gzipped ? gunzipSync(bytes) : bytes);
}

const EMPTY_HINT: GeoHint = { country: null, city: null, point: null, nearest_iata: [] };

/** The hint for one IP; empty when the database is missing or does not know the address. */
export function geoHintFor(lookup: GeoIpLookup | null, ip: string | undefined): GeoHint {
  if (lookup === null || ip === undefined) return EMPTY_HINT;
  const record = lookup.lookup(ip);
  if (record === null) return EMPTY_HINT;
  const nearest =
    record.point === null
      ? []
      : nearestAirports(airportDataset().airports, record.point, 3).map((n) => n.airport.iata);
  return { country: record.country, city: record.city, point: record.point, nearest_iata: nearest };
}

/** Railway's edge sets `x-real-ip` to the connecting client (docs/system-architecture.md §6). */
function clientIp(headers: Headers): string | undefined {
  const value = headers.get('x-real-ip')?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

export interface GeoRouteDeps {
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  /** The loaded database, or null while it loads or when none is configured. */
  readonly geo: () => GeoIpLookup | null;
}

/** A hint per screen visit is plenty; this only stops a runaway client. */
const GEO_PER_UID_RULE = { windowSeconds: 60, max: 30 };

export function registerGeoRoutes(app: OpenAPIHono<AppEnv>, deps: GeoRouteDeps): void {
  app.get('/v1/geo/hint', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'geo', uid, GEO_PER_UID_RULE);
    c.header('Cache-Control', 'private, no-store');
    return c.json(geoHintFor(deps.geo(), clientIp(c.req.raw.headers)));
  });
}

/**
 * Mounts the route and loads `source` in the background: the api serves (with null hints) while
 * the database downloads, and keeps serving nulls if it cannot load.
 */
export function registerGeoRoutesFromEnv(
  app: OpenAPIHono<AppEnv>,
  deps: Omit<GeoRouteDeps, 'geo'>,
  source: string | undefined,
  logger: Pick<Logger, 'info' | 'warn'>,
): void {
  let lookup: GeoIpLookup | null = null;
  if (source === undefined) {
    logger.warn('GET /v1/geo/hint answers nulls: GEOIP_CITY_MMDB is unset');
  } else {
    loadGeoIpDatabase(source)
      .then((loaded) => {
        lookup = loaded;
        logger.info('geo database loaded');
      })
      .catch((error: unknown) => logger.warn({ err: error }, 'geo database failed to load'));
  }
  registerGeoRoutes(app, { ...deps, geo: () => lookup });
}
