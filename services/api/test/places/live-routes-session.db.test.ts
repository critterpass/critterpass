/**
 * The live place routes read the signed-in session the same way every other places route does:
 * through `createApp` with a real Better Auth session, `/v1/places/search/live`,
 * `/v1/places/search/live/resolve` and `/v1/places/{id}/live` answer the caller (200), and a
 * request without a session is refused (401). They sit two segments below `/v1/places/`, where
 * the one-segment session pattern did not reach, and answered 401 to everyone.
 */
import { runMigrations } from '@cp/db';
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { generateUuidV7 } from '@cp/domain';
import pg from 'pg';
import { pino } from 'pino';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import { createAuthModule, type AuthModule } from '../../src/auth';
import { betterAuthSessionResolver } from '../../src/commands/_framework/session';
import { disabledAttestationConfig } from '../auth/test-attestation-config';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let authModule: AuthModule;
let app: ReturnType<typeof createApp>;
let cookie: string;
let poiId: string;

const request = (path: string, withSession = true) =>
  Promise.resolve(
    app.request(`http://localhost:8787${path}`, {
      headers: withSession ? { cookie } : {},
    }),
  );

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  pool.on('error', () => undefined);
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();
  authModule = createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: 'test-secret-at-least-32-characters-long',
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: {},
    rateLimit: { customRules: { '/sign-in/*': { window: 1, max: 1000 } } },
    attestation: disabledAttestationConfig(),
  });
  app = createApp({
    service: 'api',
    version: 'test',
    commit: 'test',
    logger: pino({ level: 'silent' }),
    readiness: {},
    exposeDocs: false,
    pool,
    sessions: betterAuthSessionResolver(authModule.auth.api),
  });
  app.on(['GET', 'POST'], '/api/auth/*', (c) => authModule.handler(c.req.raw));

  const signIn = await app.request('http://localhost:8787/api/auth/sign-in/anonymous', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  cookie =
    /better-auth\.session_token=[^;]+/.exec(signIn.headers.get('set-cookie') ?? '')?.[0] ?? '';
  expect(cookie).not.toBe('');

  const destination = await pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, coverage, tz) VALUES ('da-nang', 'Đà Nẵng', 'live', 'Asia/Ho_Chi_Minh') RETURNING id",
  );
  const poi = await pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, 'Chợ Hàn', 'market', 16.0683, 108.2240) RETURNING id`,
    [destination.rows[0]?.id],
  );
  poiId = poi.rows[0]?.id ?? '';
}, 240_000);

afterAll(async () => {
  await authModule?.close();
  redis?.destroy();
  await pool?.end();
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

describe('the live place routes read the session', () => {
  const routes = () => [
    '/v1/places/search/live?q=c%C3%A0%20ph%C3%AA',
    `/v1/places/search/live/resolve?fsq_place_id=4b0588f1f964a52079a222e3&destination_id=${generateUuidV7()}`,
    `/v1/places/${poiId}/live`,
  ];

  it('answers the signed-in caller', async () => {
    for (const path of routes()) {
      const response = await request(path);
      expect({ path, status: response.status }).toEqual({ path, status: 200 });
    }
  });

  it('still refuses a request with no session', async () => {
    for (const path of routes()) {
      const response = await request(path, false);
      expect({ path, status: response.status }).toEqual({ path, status: 401 });
    }
  });
});
