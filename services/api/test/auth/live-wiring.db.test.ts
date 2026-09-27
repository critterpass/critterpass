/**
 * Proves Better Auth is actually live in the API: the exact same construction and route-mounting
 * `services/api/src/index.ts` does (createApp() + createAuthModule() + this phase's own route
 * registrars), driven over Hono's `app.request()` against a real Testcontainers Postgres + Redis —
 * not the standalone `createAuthModule()` harness the other `*.db.test.ts` files in this directory
 * use. `src/index.ts` itself is a side-effecting bootstrap (reads `process.env`, opens a real
 * listening socket) and is intentionally never imported directly by a test.
 */
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { runMigrations } from '@cp/db';
import { pino } from 'pino';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import { createAuthModule, type AuthModule } from '../../src/auth';
import {
  buildAuthRateLimitCustomRules,
  buildTrustedOriginsFromEnv,
} from '../../src/auth/bootstrap';
import {
  registerAuthExtraRoutes,
  registerMergeExecuteRoute,
  registerMergeTicketPreviewRoute,
  registerReturningPhoneSignInRoute,
} from '../../src/routes/auth-extra';

import { disabledAttestationConfig } from './test-attestation-config';

const SECRET = 'test-secret-at-least-32-characters-long';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let authModule: AuthModule;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();

  authModule = createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: SECRET,
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: buildTrustedOriginsFromEnv({ APP_TRUSTED_ORIGINS: undefined }),
    otpAdapters: {},
    rateLimit: { customRules: buildAuthRateLimitCustomRules() },
    attestation: disabledAttestationConfig(),
  });

  app = createApp({
    service: 'api',
    version: '0.0.0-test',
    commit: 'test',
    logger: pino({ level: 'silent' }),
    exposeDocs: false,
    readiness: {},
  });
  registerAuthExtraRoutes(app, { redis });
  registerMergeTicketPreviewRoute(app, { auth: authModule.auth, appPool: pool, secret: SECRET });
  registerMergeExecuteRoute(app, { auth: authModule.auth, appPool: pool, redis, secret: SECRET });
  registerReturningPhoneSignInRoute(app, { auth: authModule.auth, redis, secret: SECRET });
  app.on(['GET', 'POST'], '/api/auth/*', (c) => authModule.handler(c.req.raw));
}, 180_000);

afterAll(async () => {
  await authModule.close();
  redis.destroy();
  await pool.end();
  await Promise.all([postgres.stop(), redisContainer.stop()]);
});

describe('Better Auth mounted through the real createApp()', () => {
  it('creates a real anonymous session and public.users row over /api/auth/sign-in/anonymous', async () => {
    const response = await app.request('/api/auth/sign-in/anonymous', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string } };

    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM users WHERE id = $1',
      [body.user.id],
    );
    expect(rows).toEqual([{ status: 'anonymous' }]);
  });

  it("issues an attestation challenge over /v1/attest/challenge (this phase's own route, not a Better Auth endpoint)", async () => {
    const response = await app.request('/v1/attest/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ installId: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { challenge: string };
    expect(body.challenge.length).toBeGreaterThan(0);
  });

  it('still serves the health/readiness routes createApp() always registers', async () => {
    const response = await app.request('/health');
    expect(response.status).toBe(200);
  });

  it('returns 404 (not swallowed by the auth catch-all) for an unrelated path', async () => {
    const response = await app.request('/api/auth/this-endpoint-does-not-exist');
    expect(response.status).toBe(404);
  });
});
