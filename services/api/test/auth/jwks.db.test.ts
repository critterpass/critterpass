/**
 * A token verifies by kid before and after rotation; wrong `aud` is rejected; a revoked session
 * cannot mint tokens. Drives a real HTTP server (`jose.createRemoteJWKSet` fetches `/api/auth/jwks`
 * over the network, matching what PowerSync/Centrifugo do — a spike finding).
 */
import { serve } from '@hono/node-server';
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { runMigrations } from '@cp/db';
import { Hono } from 'hono';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuthModule, type AuthModule } from '../../src/auth';
import { registerAuthTokenRoutes, rotateJwksIfDue } from '../../src/auth/tokens';

import { disabledAttestationConfig } from './test-attestation-config';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let authModule: AuthModule;
let closeServer: () => Promise<void>;
let baseUrl: string;

function buildApp(): AuthModule {
  return createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: 'test-secret-at-least-32-characters-long',
    baseUrl: 'http://localhost:0/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: {},
    // Rotation is otherwise lazy against a 90 d default; the rotation test below forces it inside
    // one run by giving the key almost no lifetime.
    jwksRotationIntervalSeconds: 1,
    // This suite signs in repeatedly to test token minting, not rate limiting (that is
    // abuse/rate-limits.db.test.ts): Better Auth's own hard-coded default for /sign-in* (3 per 10 s)
    // would otherwise fail this file's later tests.
    rateLimit: { customRules: { '/sign-in/*': { window: 1, max: 1000 } } },
    attestation: disabledAttestationConfig(),
  });
}

async function serveModule(
  module: AuthModule,
): Promise<{ close(): Promise<void>; baseUrl: string }> {
  const app = new Hono<{ Variables: object }>();
  registerAuthTokenRoutes(app, module.auth);
  app.on(['GET', 'POST'], '/api/auth/*', (c) => module.handler(c.req.raw));
  const started = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => resolve(s));
  });
  const address = started.address();
  if (!address || typeof address === 'string') throw new Error('expected a network address');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => started.close((e) => (e ? reject(e) : resolve()))),
  };
}

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();

  authModule = buildApp();
  const running = await serveModule(authModule);
  baseUrl = running.baseUrl;
  closeServer = () => running.close();
}, 180_000);

afterAll(async () => {
  await closeServer?.();
  await authModule?.close();
  redis?.destroy();
  await pool?.end();
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

interface AnonymousSignInResult {
  readonly cookie: string;
  readonly uid: string;
}

async function signInAnonymously(): Promise<AnonymousSignInResult> {
  const response = await fetch(`${baseUrl}/api/auth/sign-in/anonymous`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const setCookie = response.headers.get('set-cookie');
  const cookie = /better-auth\.session_token=[^;]+/.exec(setCookie ?? '')?.[0];
  const body = (await response.json()) as { user: { id: string } };
  if (!cookie) {
    throw new Error(
      `sign-in/anonymous did not set a session cookie (status ${response.status}): ${JSON.stringify(body)}`,
    );
  }
  return { cookie, uid: body.user.id };
}

async function fetchToken(cookie: string, aud: string): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/token?aud=${aud}`, { headers: { cookie } });
}

describe('GET /api/auth/token', () => {
  it('mints a token that verifies via the real JWKS endpoint, with the requested audience and sub', async () => {
    const { cookie, uid } = await signInAnonymously();
    const response = await fetchToken(cookie, 'sync');
    expect(response.status).toBe(200);
    const { token } = (await response.json()) as { token: string };

    const jwks = createRemoteJWKSet(new URL(`${baseUrl}/api/auth/jwks`));
    const { payload } = await jwtVerify(token, jwks, { audience: 'sync' });
    expect(payload.sub).toBe(uid);
    expect(payload['anon']).toBe(true);
    expect(typeof payload['sid']).toBe('string');
    expect(payload.iat).toBeDefined();
  });

  it('serves JWKS keys with use: "sig" (Centrifugo rejects keys without it)', async () => {
    const response = await fetch(`${baseUrl}/api/auth/jwks`);
    const body = (await response.json()) as { keys: Array<{ use?: string }> };
    expect(body.keys.length).toBeGreaterThan(0);
    for (const key of body.keys) expect(key.use).toBe('sig');
  });

  it('rejects an aud outside sync|rt', async () => {
    const { cookie } = await signInAnonymously();
    const response = await fetchToken(cookie, 'bogus');
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION');
  });

  it('rejects a token minted for aud=rt when verified expecting aud=sync', async () => {
    const { cookie } = await signInAnonymously();
    const response = await fetchToken(cookie, 'rt');
    const { token } = (await response.json()) as { token: string };
    const jwks = createRemoteJWKSet(new URL(`${baseUrl}/api/auth/jwks`));
    await expect(jwtVerify(token, jwks, { audience: 'sync' })).rejects.toThrow();
  });

  it('requires a session: no cookie means AUTH_REQUIRED, not a token', async () => {
    const response = await fetch(`${baseUrl}/api/auth/token?aud=sync`);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  it('a revoked session cannot mint a token', async () => {
    const { cookie } = await signInAnonymously();
    const signOut = await fetch(`${baseUrl}/api/auth/sign-out`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(signOut.status).toBe(200);
    const response = await fetchToken(cookie, 'sync');
    expect(response.status).toBe(401);
  });

  it('verifies by kid before and after key rotation', async () => {
    const { cookie } = await signInAnonymously();
    const before = await fetchToken(cookie, 'sync');
    const { token: tokenBeforeRotation } = (await before.json()) as { token: string };

    await new Promise((resolve) => setTimeout(resolve, 1100));
    await rotateJwksIfDue(authModule.auth);

    const after = await fetchToken(cookie, 'sync');
    const { token: tokenAfterRotation } = (await after.json()) as { token: string };

    const beforeHeader = JSON.parse(
      Buffer.from(tokenBeforeRotation.split('.')[0] ?? '', 'base64url').toString('utf8'),
    ) as { kid: string };
    const afterHeader = JSON.parse(
      Buffer.from(tokenAfterRotation.split('.')[0] ?? '', 'base64url').toString('utf8'),
    ) as { kid: string };
    expect(afterHeader.kid).not.toBe(beforeHeader.kid);

    const jwks = createRemoteJWKSet(new URL(`${baseUrl}/api/auth/jwks`));
    await expect(jwtVerify(tokenBeforeRotation, jwks, { audience: 'sync' })).resolves.toBeDefined();
    await expect(jwtVerify(tokenAfterRotation, jwks, { audience: 'sync' })).resolves.toBeDefined();
  });
});
