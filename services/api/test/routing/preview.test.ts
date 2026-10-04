/**
 * `POST /v1/routes/preview`: routed walk and drive from recorded Valhalla answers, the straight-line
 * fallback when a point is off the road graph or the router is unset, the drive factor, the
 * session requirement and the per-user rate limit. The position travels only in the body.
 */
import { decodePolyline, DomainError, PLAN_LEG_SHAPE_PRECISION } from '@cp/domain';
import { createValhallaClient } from '@cp/suppliers';
import { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import type { RateLimitRedisClient } from '../../src/abuse/rate-limits';
import type { AppEnv } from '../../src/app';
import { previewRoute, type PreviewRouter } from '../../src/routing/preview';
import {
  registerRoutePreviewRoute,
  ROUTE_PREVIEW_PER_UID_RULE,
} from '../../src/routing/preview-route';

import { replayValhalla } from '../../../../packages/suppliers/src/valhalla/fixtures/replay';

const P = {
  kyotoStation: { lat: 34.9858, lng: 135.7588 },
  kiyomizu: { lat: 34.9949, lng: 135.785 },
  dragonBridge: { lat: 16.0611, lng: 108.2272 },
  marble: { lat: 16.0039, lng: 108.2633 },
  myKhe: { lat: 16.0544, lng: 108.247 },
  sea: { lat: 15.5, lng: 109.5 },
};

class MemoryRedis implements RateLimitRedisClient {
  private readonly counts = new Map<string, number>();
  incr(key: string) {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return Promise.resolve(next);
  }
  expire() {
    return Promise.resolve(1);
  }
  ttl() {
    return Promise.resolve(1800);
  }
}

function routerFor(...scenarios: string[]): PreviewRouter {
  const replays = scenarios.map((scenario) => replayValhalla(scenario));
  const fetch = async (input: string | URL, init?: RequestInit) => {
    for (const replay of replays) {
      const answer = await replay.fetch(input, init).catch(() => undefined);
      if (answer !== undefined) return answer;
    }
    throw new Error('unrecorded request');
  };
  return createValhallaClient({ baseUrl: 'http://valhalla.test:8002', fetch, retries: 0 });
}

function buildApp(router: PreviewRouter | null, options: { signedIn?: boolean } = {}) {
  const app = new OpenAPIHono<AppEnv>();
  const fallbacks: string[] = [];
  registerRoutePreviewRoute(app, {
    // Only a `trip_id` reads the database; these requests carry none.
    pool: undefined as unknown as pg.Pool,
    sessions: () =>
      Promise.resolve(
        options.signedIn === false
          ? null
          : { uid: '00000000-0000-7000-8000-000000000003', isAnonymous: false },
      ),
    redis: new MemoryRedis(),
    router,
    onFallback: (kind) => fallbacks.push(kind),
  });
  app.onError((error, c) => {
    if (error instanceof ZodError) return c.json({ error: { code: 'VALIDATION' } }, 422);
    if (error instanceof DomainError) return c.json(error.toResponseBody(), error.http as never);
    throw error;
  });
  return { app, fallbacks };
}

const post = (app: OpenAPIHono<AppEnv>, body: unknown) =>
  app.request('/v1/routes/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('route preview', () => {
  it('draws the recorded walking route with its road shape', async () => {
    const { app, fallbacks } = buildApp(routerFor('kyoto-route-walk'));
    const response = await post(app, { from: P.kyotoStation, to: P.kiyomizu });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = (await response.json()) as Awaited<ReturnType<typeof previewRoute>>;
    expect(body.walk).toMatchObject({
      minutes: 45,
      meters: 3467,
      approx: false,
      source: 'valhalla',
    });
    const line = decodePolyline(body.walk.shape ?? '', PLAN_LEG_SHAPE_PRECISION);
    expect(line.length).toBeGreaterThan(2);
    expect(line.length).toBeLessThanOrEqual(200);
    expect(line[0]?.[0]).toBeCloseTo(P.kyotoStation.lng, 2);
    expect(line.at(-1)?.[1]).toBeCloseTo(P.kiyomizu.lat, 2);
    // No drive answer was recorded for this pair: drive is an "about" estimate without a line.
    expect(body.drive).toMatchObject({ approx: true, source: 'straight_line', shape: null });
    expect(fallbacks).toEqual(['unavailable']);
  });

  it('routes the drive and applies the destination drive factor', async () => {
    const router = routerFor('danang-route-drive');
    const plain = await previewRoute(router, {
      from: P.dragonBridge,
      to: P.marble,
      driveFactor: 1,
    });
    expect(plain.drive).toMatchObject({ minutes: 17, meters: 8476, source: 'valhalla' });
    expect(plain.drive.shape).not.toBeNull();
    const slow = await previewRoute(router, {
      from: P.dragonBridge,
      to: P.marble,
      driveFactor: 1.5,
    });
    expect(slow.drive.minutes).toBe(26);
  });

  it('falls back to straight-line minutes when a point is off the road graph', async () => {
    const { app, fallbacks } = buildApp(routerFor('danang-route-off-graph'));
    const response = await post(app, { from: P.sea, to: P.myKhe });
    const body = (await response.json()) as Awaited<ReturnType<typeof previewRoute>>;
    expect(response.status).toBe(200);
    expect(body.drive).toMatchObject({ approx: true, source: 'straight_line', shape: null });
    expect(body.drive.minutes).toBeGreaterThan(0);
    expect(fallbacks).toContain('off_graph');
  });

  it('answers straight-line estimates when no router is configured', async () => {
    const { app } = buildApp(null);
    const body = (await (await post(app, { from: P.kyotoStation, to: P.kiyomizu })).json()) as {
      walk: { approx: boolean; shape: string | null };
    };
    expect(body.walk).toMatchObject({ approx: true, shape: null });
  });

  it('needs a session', async () => {
    const { app } = buildApp(null, { signedIn: false });
    const response = await post(app, { from: P.kyotoStation, to: P.kiyomizu });
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'AUTH_REQUIRED',
    );
  });

  it('rejects coordinates out of range', async () => {
    const { app } = buildApp(null);
    const response = await post(app, { from: { lat: 91, lng: 0 }, to: P.kiyomizu });
    expect(response.status).toBe(422);
  });

  it('limits each user to 60 previews an hour', async () => {
    const { app } = buildApp(null);
    for (let i = 0; i < ROUTE_PREVIEW_PER_UID_RULE.max; i += 1) {
      expect((await post(app, { from: P.kyotoStation, to: P.kiyomizu })).status).toBe(200);
    }
    const limited = await post(app, { from: P.kyotoStation, to: P.kiyomizu });
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as { error: { code: string; detail: unknown } };
    expect(body.error).toMatchObject({ code: 'RATE_LIMITED', detail: { retry_after_s: 1800 } });
  });
});
