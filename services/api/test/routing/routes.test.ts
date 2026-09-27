/**
 * `/v1/routes/*` through Hono with the Mapbox provider replaying recorded Kyoto responses. The same
 * test-only session stand-in as the places suites sets `uid`.
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import type { AppEnv } from '../../src/app';
import { createMapboxRoutingProvider, straightLineRoutingProvider } from '../../src/routing/eta';
import { MapboxRoutingClient } from '../../src/routing/mapbox';
import type { RoutingProvider } from '../../src/routing/provider';
import { registerRoutingRoutes } from '../../src/routing/routes';

import { loadExchanges, replayClient } from './http-fixtures';
import { KIYOMIZU_DERA, KYOTO_STATION, MATRIX_SCENARIOS, RECORDED_NOW } from './scenarios';

function buildApp(routing: RoutingProvider, signedIn = true) {
  const app = new OpenAPIHono<AppEnv>();
  app.use('*', async (c, next) => {
    if (signedIn) c.set('uid', '00000000-0000-7000-8000-000000000003');
    await next();
  });
  registerRoutingRoutes(app, { routing });
  app.onError((error, c) => {
    if (error instanceof ZodError) return c.json({ error: { code: 'VALIDATION' } }, 422);
    const domain = error as { http?: number; toResponseBody?: () => unknown };
    if (typeof domain.toResponseBody === 'function') {
      return c.json(domain.toResponseBody(), domain.http as never);
    }
    throw error;
  });
  return app;
}

function mapboxFor(...scenarios: string[]) {
  return createMapboxRoutingProvider({
    client: new MapboxRoutingClient({
      accessToken: 'test-token',
      http: replayClient(scenarios.flatMap(loadExchanges)),
    }),
    now: () => RECORDED_NOW,
  });
}

const trip = `from=${KYOTO_STATION.lat},${KYOTO_STATION.lng}&to=${KIYOMIZU_DERA.lat},${KIYOMIZU_DERA.lng}`;

describe('GET /v1/routes/eta', () => {
  it('returns a routed Kyoto walk with Mapbox attribution', async () => {
    const response = await buildApp(mapboxFor('kyoto-walk')).request(
      `/v1/routes/eta?${trip}&mode=walk`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      minutes: 45,
      distance_m: 3421,
      traffic: false,
      mode: 'walk',
      estimate: false,
      source: 'mapbox',
    });
    expect(body['attribution']).toEqual([
      { label: '© Mapbox', url: 'https://www.mapbox.com/about/maps' },
      { label: '© OpenStreetMap', url: 'https://www.openstreetmap.org/about' },
    ]);
  });

  it('returns a flagged transit estimate with its reason and no attribution', async () => {
    const response = await buildApp(mapboxFor()).request(`/v1/routes/eta?${trip}&mode=transit`);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      estimate: true,
      estimate_reason: 'transit_unsupported',
      source: 'straight_line',
      mode: 'transit',
    });
    expect(body['attribution']).toBeUndefined();
  });

  it('accepts closure polygons as JSON', async () => {
    const closures = encodeURIComponent(
      JSON.stringify([
        [
          [135.764, 34.988],
          [135.772, 34.988],
          [135.772, 34.9905],
          [135.764, 34.9905],
          [135.764, 34.988],
        ],
      ]),
    );
    const response = await buildApp(mapboxFor('kyoto-drive-closure')).request(
      `/v1/routes/eta?${trip}&mode=drive&closures=${closures}`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      distance_m: 3915,
      traffic: true,
      estimate: false,
    });
  });

  it('rejects malformed coordinates and unknown modes', async () => {
    const app = buildApp(straightLineRoutingProvider);
    expect((await app.request(`/v1/routes/eta?from=91,0&to=0,0&mode=walk`)).status).toBe(422);
    expect((await app.request(`/v1/routes/eta?${trip}&mode=boat`)).status).toBe(422);
    expect((await app.request(`/v1/routes/eta?${trip}&mode=drive&closures=nope`)).status).toBe(422);
  });

  it('requires a session', async () => {
    const response = await buildApp(straightLineRoutingProvider, false).request(
      `/v1/routes/eta?${trip}&mode=walk`,
    );
    expect(response.status).toBe(401);
  });
});

describe('GET /v1/routes/leave-by', () => {
  it('returns the traffic-aware departure time', async () => {
    const response = await buildApp(mapboxFor('kyoto-leave-by-drive')).request(
      `/v1/routes/leave-by?${trip}&mode=drive&arrive_by=2026-10-01T09:30:00%2B09:00`,
    );
    expect(await response.json()).toMatchObject({
      leave_at: '2026-10-01T00:13:00.000Z',
      minutes: 17,
      traffic: true,
      estimate: false,
    });
  });
});

describe('POST /v1/routes/matrix', () => {
  const post = (app: ReturnType<typeof buildApp>, body: unknown) =>
    app.request('/v1/routes/matrix', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('returns the Kyoto drive matrix', async () => {
    const { origins, destinations } = MATRIX_SCENARIOS['kyoto-matrix-drive'];
    const response = await post(buildApp(mapboxFor('kyoto-matrix-drive')), {
      origins,
      destinations,
      mode: 'drive',
    });
    expect(await response.json()).toMatchObject({
      minutes: [
        [15, 14, 27],
        [14, 15, 26],
        [29, 31, 15],
      ],
      traffic: true,
      estimate: false,
      source: 'mapbox',
    });
  });

  it('rejects more than 50 origins', async () => {
    const point = { lat: 35, lng: 135.7 };
    const response = await post(buildApp(straightLineRoutingProvider), {
      origins: Array.from({ length: 51 }, () => point),
      destinations: [point],
      mode: 'walk',
    });
    expect(response.status).toBe(422);
  });
});
