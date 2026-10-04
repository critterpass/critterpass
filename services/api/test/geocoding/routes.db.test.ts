/**
 * `/v1/geocode` and `/v1/geocode/reverse` against real Postgres (Testcontainers). Same minimal
 * test-only auth stand-in as `../places/routes.db.test.ts` (the real session-verification middleware
 * does not exist yet). Mapbox is replayed at its HTTP boundary: answers recorded from Geocoding v6
 * (./fixtures, see README.txt there) for the address cases, and a hand-built feature list for the
 * older fallback cases. The rate limit runs on a real Redis and the monthly cap through the real
 * `app.reserve_mapbox_geocode_call`.
 */
import { readFileSync } from 'node:fs';

import { runMigrations } from '@cp/db';
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { OpenAPIHono } from '@hono/zod-openapi';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AppEnv } from '../../src/app';
import { registerGeocodingRoutes, type GeocodingRouteDeps } from '../../src/geocoding/routes';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let redis: RedisClientType;
let pool: pg.Pool;
let destinationId: string;
let poiId: string;

const TEST_UID = '00000000-0000-7000-8000-000000000002';

/** Mapbox's HTTP boundary: answers every forward geocode with `features` and counts the calls. */
function fakeMapbox(features: unknown[]) {
  const calls: string[] = [];
  return {
    calls,
    http: {
      fetch: (input: string) => {
        calls.push(input);
        return Promise.resolve(Response.json({ type: 'FeatureCollection', features }));
      },
    },
  };
}

/** Replays one recorded Geocoding v6 answer for every request and keeps the URLs asked. */
function recordedMapbox(file: string) {
  const body = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8');
  const calls: string[] = [];
  return {
    calls,
    http: {
      fetch: (input: string) => {
        calls.push(input);
        return Promise.resolve(
          new Response(body, { headers: { 'content-type': 'application/json' } }),
        );
      },
    },
  };
}

const STREETS_IN_DA_NANG = 'v6-forward-street-only-vo-nguyen-giap-da-nang.json';
const ADDRESS_IN_LISBON = 'v6-forward-address-constructed-lisbon.json';
const NO_FEATURES = 'v6-forward-address-vo-nguyen-giap-da-nang.json';

interface TestMapbox {
  readonly calls: string[];
  readonly http: NonNullable<GeocodingRouteDeps['mapboxHttp']>;
}

function buildTestApp(
  mapboxToken?: string,
  mapbox: TestMapbox = fakeMapbox([]),
  extra: Partial<GeocodingRouteDeps> & { readonly signedOut?: boolean } = {},
) {
  const { signedOut, ...deps } = extra;
  const app = new OpenAPIHono<AppEnv>();
  app.use('*', async (c, next) => {
    if (signedOut !== true) {
      c.set('uid', TEST_UID);
      c.set('device', 'test-device');
    }
    await next();
  });
  registerGeocodingRoutes(app, {
    pool,
    redis,
    mapboxHttp: mapbox.http,
    ...(mapboxToken !== undefined ? { mapboxToken } : {}),
    ...deps,
  });
  app.onError((error, c) => {
    const anyError = error as { http?: number; toResponseBody?: () => unknown };
    if (typeof anyError.toResponseBody === 'function')
      return c.json(anyError.toResponseBody(), anyError.http as never);
    return c.json({ error: { code: 'INTERNAL', message: String(error), retryable: true } }, 500);
  });
  return app;
}

interface ForwardBody {
  readonly results: { source: string; label: string; lat: number; lng: number; poiId?: string }[];
  readonly attribution?: { label: string; url: string }[];
}

async function usage(): Promise<{ calls: number; refused_calls: number } | undefined> {
  const { rows } = await pool.query<{ calls: number; refused_calls: number }>(
    'SELECT calls, refused_calls FROM mapbox_geocode_usage',
  );
  return rows[0];
}

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  await redis.connect();
  pool = new pg.Pool({
    connectionString: postgres.getConnectionUri(),
    connectionTimeoutMillis: 2000,
  });
  await runMigrations(pool);

  const { rows: destinationRows } = await pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, coverage, tz) VALUES ('lisbon', 'Lisbon', 'live', 'Europe/Lisbon') RETURNING id",
  );
  destinationId = destinationRows[0]!.id;
  const { rows: poiRows } = await pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, address)
     VALUES ($1, 'Torre de Belem', 'museum', 38.6916, -9.2160, 'Av. Brasilia') RETURNING id`,
    [destinationId],
  );
  poiId = poiRows[0]!.id;
  await pool.query(
    "INSERT INTO cities (name, country, lat, lng) VALUES ('Sintra', 'Portugal', 38.7979, -9.3903)",
  );
}, 180_000);

afterAll(async () => {
  await pool?.end();
  redis?.destroy();
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

beforeEach(async () => {
  await redis.flushDb();
  await pool.query('DELETE FROM mapbox_geocode_usage');
});

describe('GET /v1/geocode', () => {
  it('finds a local POI match before ever considering Mapbox', async () => {
    const mapbox = fakeMapbox([]);
    const app = buildTestApp('unused-token', mapbox);
    const response = await app.request('/v1/geocode?q=Torre+de+Belem');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: { source: string; poiId?: string }[] };
    expect(body.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'poi', poiId })]),
    );
  });

  it('finds a local city match', async () => {
    const app = buildTestApp();
    const response = await app.request('/v1/geocode?q=Sintra');
    const body = (await response.json()) as { results: { source: string; label: string }[] };
    expect(body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'city', label: 'Sintra, Portugal' }),
      ]),
    );
  });

  it('falls back to Mapbox when neither local source matches and a token is configured', async () => {
    const mapbox = fakeMapbox([
      {
        geometry: { coordinates: [135.7684, 34.9546] },
        properties: {
          full_address: '伏見区, 京都市, Kyoto, Japan',
          place_formatted: '京都市, Kyoto, Japan',
          context: { country: { name: 'Japan' } },
        },
      },
    ]);
    const app = buildTestApp('fake-token', mapbox);
    const response = await app.request('/v1/geocode?q=some+address+with+no+local+match+at+all');
    const body = (await response.json()) as { results: { source: string }[] };
    expect(body.results).toEqual([expect.objectContaining({ source: 'mapbox' })]);
    expect(mapbox.calls).toHaveLength(1);
  });

  it('returns no results (no Mapbox call) when neither local source matches and no token is configured', async () => {
    const mapbox = fakeMapbox([]);
    const app = buildTestApp(undefined, mapbox);
    const response = await app.request('/v1/geocode?q=some+address+with+no+local+match+at+all');
    const body = (await response.json()) as { results: unknown[] };
    expect(body.results).toEqual([]);
    expect(mapbox.calls).toHaveLength(0);
  });
});

describe('GET /v1/geocode for a street address', () => {
  it('biases Mapbox to the near point, asks for streets and addresses only and credits Mapbox', async () => {
    const mapbox = recordedMapbox(STREETS_IN_DA_NANG);
    const app = buildTestApp('fake-token', mapbox);
    const response = await app.request(
      `/v1/geocode?q=${encodeURIComponent('10 Vo Nguyen Giap, Da Nang')}&near=16.05,108.22&limit=3`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as ForwardBody;
    expect(body.results[0]).toEqual({
      source: 'mapbox',
      label: 'Võ Nguyên Giáp, Phước Mỹ, 50400, An Hải, Da Nang, Vietnam',
      lat: 16.058354,
      lng: 108.246677,
    });
    expect(body.attribution?.map((credit) => credit.label)).toEqual([
      '© Mapbox',
      '© OpenStreetMap',
    ]);
    const asked = new URL(mapbox.calls[0]!);
    expect(asked.searchParams.get('proximity')).toBe('108.22,16.05');
    expect(asked.searchParams.get('types')).toBe('address,street');
    expect(asked.searchParams.get('limit')).toBe('3');
    expect(asked.searchParams.get('permanent')).toBe('true');
    expect(await usage()).toEqual({ calls: 1, refused_calls: 0 });
  });

  it('asks Mapbox for text that reads like an address even when a place of ours matches, ours first', async () => {
    const mapbox = recordedMapbox(ADDRESS_IN_LISBON);
    const app = buildTestApp('fake-token', mapbox);
    const response = await app.request('/v1/geocode?q=Torre+de+Belem+24');
    const body = (await response.json()) as ForwardBody;
    expect(body.results.map((result) => result.source)).toEqual(['poi', 'mapbox']);
    expect(body.results[1]?.label).toBe('Rua Augusta 24, 1100-053 Lisboa, Portugal');
    expect(mapbox.calls).toHaveLength(1);
  });

  it('answers without a credit when Mapbox knows no such address', async () => {
    const app = buildTestApp('fake-token', recordedMapbox(NO_FEATURES));
    const response = await app.request('/v1/geocode?q=10+Vo+Nguyen+Giap&near=16.05,108.22');
    expect(await response.json()).toEqual({ results: [] });
  });

  it("answers from our own places only once the month's Mapbox calls are spent", async () => {
    const mapbox = recordedMapbox(ADDRESS_IN_LISBON);
    let refusals = 0;
    const app = buildTestApp('fake-token', mapbox, {
      mapboxMonthlyCap: 1,
      onMapboxCapReached: () => (refusals += 1),
    });
    const first = (await (await app.request('/v1/geocode?q=Rua+Augusta+24')).json()) as ForwardBody;
    expect(first.results.map((result) => result.source)).toEqual(['mapbox']);

    const capped = await app.request('/v1/geocode?q=Torre+de+Belem+24');
    expect(capped.status).toBe(200);
    const body = (await capped.json()) as ForwardBody;
    expect(body.results.map((result) => result.source)).toEqual(['poi']);
    expect(body.attribution).toBeUndefined();
    expect(mapbox.calls).toHaveLength(1);
    expect(refusals).toBe(1);
    expect(await usage()).toEqual({ calls: 1, refused_calls: 1 });
  });

  it('keeps our own matches when Mapbox fails, and fails the lookup when there are none', async () => {
    const down = {
      calls: [] as string[],
      http: { fetch: () => Promise.resolve(new Response('busy', { status: 503 })) },
    };
    const app = buildTestApp('fake-token', down);
    const withOurs = await app.request('/v1/geocode?q=Torre+de+Belem+24');
    expect(withOurs.status).toBe(200);
    const body = (await withOurs.json()) as ForwardBody;
    expect(body.results.map((result) => result.source)).toEqual(['poi']);

    const withNone = await app.request('/v1/geocode?q=99+Nowhere+Lane');
    const error = (await withNone.json()) as { error: { code: string } };
    expect(error.error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('refuses a caller without a session before any lookup', async () => {
    const mapbox = recordedMapbox(ADDRESS_IN_LISBON);
    const app = buildTestApp('fake-token', mapbox, { signedOut: true });
    const response = await app.request('/v1/geocode?q=Rua+Augusta+24');
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('AUTH_REQUIRED');
    expect(mapbox.calls).toHaveLength(0);
  });

  it('limits lookups per user and says when to try again', async () => {
    const mapbox = recordedMapbox(ADDRESS_IN_LISBON);
    const app = buildTestApp('fake-token', mapbox, { rateLimit: { windowSeconds: 60, max: 2 } });
    expect((await app.request('/v1/geocode?q=Rua+Augusta+24')).status).toBe(200);
    expect((await app.request('/v1/geocode?q=Rua+Augusta+24')).status).toBe(200);
    const third = await app.request('/v1/geocode?q=Rua+Augusta+24');
    expect(third.status).toBe(429);
    const body = (await third.json()) as {
      error: { code: string; detail: { retry_after_s: number } };
    };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.detail.retry_after_s).toBeGreaterThan(0);
    expect(mapbox.calls).toHaveLength(2);
  });

  it.each(['north,east', '91,10', '16.05'])('rejects the near point %s', async (near) => {
    const app = buildTestApp('fake-token');
    const response = await app.request(`/v1/geocode?q=Rua+Augusta+24&near=${near}`);
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION');
  });
});

describe('GET /v1/geocode/reverse', () => {
  it('finds the nearest POI within 60 m', async () => {
    const app = buildTestApp();
    const response = await app.request('/v1/geocode/reverse?lat=38.6916&lng=-9.2160');
    const body = (await response.json()) as { source: string; poiId: string };
    expect(body).toEqual(expect.objectContaining({ source: 'poi', poiId }));
  });

  it('falls back to the nearest city locality beyond 60 m from any POI', async () => {
    const app = buildTestApp();
    const response = await app.request('/v1/geocode/reverse?lat=38.7979&lng=-9.3903');
    const body = (await response.json()) as { source: string; label: string };
    expect(body).toEqual(expect.objectContaining({ source: 'city', label: 'Sintra, Portugal' }));
  });

  it('returns source:none far from every POI and city', async () => {
    const app = buildTestApp();
    const response = await app.request('/v1/geocode/reverse?lat=0&lng=0');
    const body = (await response.json()) as { source: string };
    expect(body.source).toBe('none');
  });
});
