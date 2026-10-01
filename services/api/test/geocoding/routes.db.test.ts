/**
 * `/v1/geocode` and `/v1/geocode/reverse` against real Postgres (Testcontainers). Same minimal
 * test-only auth stand-in as `../places/routes.db.test.ts` (the real session-verification middleware
 * does not exist yet). The Mapbox fallback path is exercised with a fake HTTP client rather than a
 * live call.
 */
import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { OpenAPIHono } from '@hono/zod-openapi';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AppEnv } from '../../src/app';
import * as mapboxModule from '../../src/geocoding/mapbox';
import { registerGeocodingRoutes } from '../../src/geocoding/routes';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let destinationId: string;
let poiId: string;

const TEST_UID = '00000000-0000-7000-8000-000000000002';

function buildTestApp(mapboxToken?: string) {
  const app = new OpenAPIHono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('uid', TEST_UID);
    c.set('device', 'test-device');
    await next();
  });
  registerGeocodingRoutes(app, { pool, ...(mapboxToken !== undefined ? { mapboxToken } : {}) });
  app.onError((error, c) => {
    const anyError = error as { http?: number; toResponseBody?: () => unknown };
    if (typeof anyError.toResponseBody === 'function')
      return c.json(anyError.toResponseBody(), anyError.http as never);
    return c.json({ error: { code: 'INTERNAL', message: String(error), retryable: true } }, 500);
  });
  return app;
}

beforeAll(async () => {
  postgres = await startPostgres();
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
  await postgres?.stop();
});

describe('GET /v1/geocode', () => {
  it('finds a local POI match before ever considering Mapbox', async () => {
    const app = buildTestApp('unused-token');
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
    const spy = vi.spyOn(mapboxModule, 'geocodeForwardMapbox').mockResolvedValue([
      {
        lat: 34.9546,
        lng: 135.7684,
        formattedAddress: '伏見区, 京都市, Kyoto, Japan',
        placeFormatted: '京都市, Kyoto, Japan',
        country: 'Japan',
      },
    ]);
    const app = buildTestApp('fake-token');
    const response = await app.request('/v1/geocode?q=some+address+with+no+local+match+at+all');
    const body = (await response.json()) as { results: { source: string }[] };
    expect(body.results).toEqual([expect.objectContaining({ source: 'mapbox' })]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('returns no results (no Mapbox call) when neither local source matches and no token is configured', async () => {
    const spy = vi.spyOn(mapboxModule, 'geocodeForwardMapbox');
    const app = buildTestApp();
    const response = await app.request('/v1/geocode?q=some+address+with+no+local+match+at+all');
    const body = (await response.json()) as { results: unknown[] };
    expect(body.results).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
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
