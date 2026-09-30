/**
 * Proves Better Auth is actually live in the API: the exact same construction and route-mounting
 * `services/api/src/index.ts` does (createApp() + createAuthModule() + this phase's own route
 * registrars + mountAuthHandler()), driven over Hono's `app.request()` against a real Testcontainers Postgres + Redis —
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
import { runMigrations, withSystem } from '@cp/db';
import { userChannel } from '@cp/domain';
import { decodeJwt } from 'jose';
import { pino } from 'pino';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import { createAuthModule, type AuthModule } from '../../src/auth';
import { betterAuthSessionResolver } from '../../src/commands/_framework/session';
import { mountAuthHandler } from '../../src/auth/mount';
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
    rateLimit: {
      customRules: buildAuthRateLimitCustomRules({
        AUTH_ANON_RATE_LIMIT_PER_HOUR: 10,
        AUTH_OTP_RATE_LIMIT_PER_HOUR: 10,
      }),
    },
    attestation: disabledAttestationConfig(),
  });

  app = createApp({
    service: 'api',
    version: '0.0.0-test',
    commit: 'test',
    logger: pino({ level: 'silent' }),
    exposeDocs: false,
    readiness: {},
    pool,
    sessions: betterAuthSessionResolver(authModule.auth.api),
  });
  registerAuthExtraRoutes(app, { redis });
  registerMergeTicketPreviewRoute(app, { auth: authModule.auth, appPool: pool, secret: SECRET });
  registerMergeExecuteRoute(app, { auth: authModule.auth, appPool: pool, redis, secret: SECRET });
  registerReturningPhoneSignInRoute(app, { auth: authModule.auth, redis, secret: SECRET });
  mountAuthHandler(app, authModule, { pool, logger: pino({ level: 'silent' }) });
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

  it('lets a signed-in session search places, and refuses a request without one', async () => {
    const signIn = await app.request('/api/auth/sign-in/anonymous', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const cookie = signIn.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const signedIn = await app.request('/v1/places/search?q=Nishiki', { headers: { cookie } });
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toEqual({ results: [] });
    const anonymous = await app.request('/v1/places/search?q=Nishiki');
    expect(anonymous.status).toBe(401);
  });

  it('mints an rt-audience token carrying the anon claim over /api/auth/token?aud=rt', async () => {
    const signIn = await app.request('/api/auth/sign-in/anonymous', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(signIn.status).toBe(200);
    const { user } = (await signIn.json()) as { user: { id: string } };
    const cookie = signIn.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');

    const response = await app.request('/api/auth/token?aud=rt', { headers: { cookie } });
    expect(response.status).toBe(200);
    const { token } = (await response.json()) as { token: string };
    const claims = decodeJwt(token);
    expect(claims).toMatchObject({ aud: 'rt', sub: user.id, anon: true });
  });

  it('serves JWKS keys marked use: "sig" over /api/auth/jwks (Centrifugo ignores keys without it)', async () => {
    const response = await app.request('/api/auth/jwks');
    expect(response.status).toBe(200);
    const { keys } = (await response.json()) as { keys: { use?: string; kid?: string }[] };
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key.use).toBe('sig');
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

async function signInAnonymously(): Promise<{ cookie: string; uid: string }> {
  const response = await app.request('/api/auth/sign-in/anonymous', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  expect(response.status).toBe(200);
  const { user } = (await response.json()) as { user: { id: string } };
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return { cookie, uid: user.id };
}

async function disconnectRows(uid: string) {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ payload: unknown }>(
      `SELECT payload FROM rt_outbox WHERE channel = $1 AND kind = 'disconnect'`,
      [userChannel(uid)],
    ),
  );
  return rows;
}

async function countDisconnectRows(): Promise<number> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM rt_outbox WHERE kind = 'disconnect'`),
  );
  return rows[0]?.n ?? 0;
}

describe('sign-out through the real createApp() ends realtime for that session', () => {
  it('queues one realtime disconnect for the signed-out user and stops minting rt tokens', async () => {
    const { cookie, uid } = await signInAnonymously();
    expect((await app.request('/api/auth/token?aud=rt', { headers: { cookie } })).status).toBe(200);

    const response = await app.request('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: '{}',
    });
    expect(response.status).toBe(200);
    // Loading the session before the handler must not hand back a refreshed cookie: sign-out only clears.
    for (const setCookie of response.headers.getSetCookie())
      expect(setCookie).toMatch(/Max-Age=0/i);

    expect(await disconnectRows(uid)).toEqual([{ payload: { type: 'session.revoked' } }]);
    expect((await app.request('/api/auth/token?aud=rt', { headers: { cookie } })).status).toBe(401);
  });

  it('queues nothing when sign-out carries no session', async () => {
    const before = await countDisconnectRows();
    const response = await app.request('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBeLessThan(500);
    expect(await countDisconnectRows()).toBe(before);
  });

  it('leaves another signed-in user untouched', async () => {
    const leaving = await signInAnonymously();
    const staying = await signInAnonymously();

    await app.request('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: leaving.cookie },
      body: '{}',
    });

    expect(await disconnectRows(staying.uid)).toEqual([]);
    const token = await app.request('/api/auth/token?aud=rt', {
      headers: { cookie: staying.cookie },
    });
    expect(token.status).toBe(200);
  });
});
