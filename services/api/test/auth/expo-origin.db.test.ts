/**
 * The origin contract between the app and the api on cookie-bearing auth POSTs, with Better Auth's
 * origin check on exactly as in production (it is off by default under NODE_ENV=test). The app's
 * Expo client sends its origin in `expo-origin` (the Expo server plugin copies it to `Origin`);
 * without it the api answers `403 MISSING_OR_NULL_ORIGIN`. Also covers the anonymous → Apple
 * upgrade end to end: a locally signed Apple ID token passes real signature, issuer, audience,
 * nonce and expiry checks, and the uid survives the link.
 */
import { createHash } from 'node:crypto';

import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { runMigrations } from '@cp/db';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createAuthModule, type AuthModule } from '../../src/auth';
import { buildTrustedOriginsFromEnv } from '../../src/auth/bootstrap';

import { disabledAttestationConfig } from './test-attestation-config';
import { buildLocalIssuer, jwksResponse } from './test-id-token-issuer';

const APPLE_CLIENT_ID = 'app.critterpass.staging';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APP_ORIGIN = 'critterpass-staging://';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let authModule: AuthModule;
let issueAppleToken: (claims: Record<string, unknown>) => Promise<string>;

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();

  const apple = await buildLocalIssuer();
  issueAppleToken = (claims) =>
    apple.sign({ iss: 'https://appleid.apple.com', aud: APPLE_CLIENT_ID, ...claims });
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(APPLE_JWKS_URL)) return jwksResponse(apple.jwks);
    return realFetch(input, init);
  });

  authModule = createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: 'test-secret-at-least-32-characters-long',
    baseUrl: 'http://localhost:8787/api/auth',
    // The deployed list, so the scheme the app sends is checked against what production trusts.
    trustedOrigins: buildTrustedOriginsFromEnv({ APP_TRUSTED_ORIGINS: undefined }),
    otpAdapters: {},
    rateLimit: {
      customRules: {
        '/sign-in/*': { window: 1, max: 1000 },
        '/link-social': { window: 1, max: 1000 },
      },
    },
    attestation: disabledAttestationConfig(),
    apple: { clientId: APPLE_CLIENT_ID },
  });
  // Better Auth turns the origin check off whenever NODE_ENV is `test`; production runs with it on.
  const context = await authModule.auth.$context;
  context.skipOriginCheck = false;
}, 180_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await authModule?.close();
  redis?.destroy();
  await pool?.end();
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

function authRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return authModule.handler(
    new Request(`http://localhost:8787/api/auth${path}`, { ...init, headers }),
  );
}

async function signInAnonymously(): Promise<{ cookie: string; uid: string }> {
  const response = await authRequest('/sign-in/anonymous', { method: 'POST', body: '{}' });
  const setCookie = response.headers.get('set-cookie');
  const cookie = /better-auth\.session_token=[^;]+/.exec(setCookie ?? '')?.[0];
  const body = (await response.json()) as { user: { id: string } };
  if (!cookie) throw new Error(`sign-in/anonymous did not set a cookie: ${JSON.stringify(body)}`);
  return { cookie, uid: body.user.id };
}

async function appleLinkBody(subject: string, tokenNonce: string, sentNonce: string) {
  const token = await issueAppleToken({
    sub: subject,
    email: `${subject}@privaterelay.appleid.com`,
    email_verified: true,
    nonce: tokenNonce,
  });
  return JSON.stringify({ provider: 'apple', idToken: { token, nonce: sentNonce } });
}

describe('origin check on cookie-bearing auth POSTs', () => {
  it('rejects link-social without expo-origin with MISSING_OR_NULL_ORIGIN', async () => {
    const { cookie } = await signInAnonymously();
    const response = await authRequest('/link-social', {
      method: 'POST',
      headers: { cookie },
      body: await appleLinkBody('apple-no-origin', 'n1', 'n1'),
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe('MISSING_OR_NULL_ORIGIN');
  });

  it('rejects an expo-origin the api does not trust with INVALID_ORIGIN', async () => {
    const { cookie } = await signInAnonymously();
    const response = await authRequest('/link-social', {
      method: 'POST',
      headers: { cookie, 'expo-origin': 'someone-else://' },
      body: await appleLinkBody('apple-bad-origin', 'n2', 'n2'),
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe('INVALID_ORIGIN');
  });

  it('rejects sign-out without expo-origin, and accepts it with one', async () => {
    const { cookie } = await signInAnonymously();
    const without = await authRequest('/sign-out', { method: 'POST', headers: { cookie } });
    expect(without.status).toBe(403);
    const withOrigin = await authRequest('/sign-out', {
      method: 'POST',
      headers: { cookie, 'expo-origin': APP_ORIGIN },
    });
    expect(withOrigin.status).toBe(200);
  });
});

describe('anonymous → Apple with the app origin', () => {
  it('links Apple onto the same uid when the token carries the raw nonce', async () => {
    const { cookie, uid } = await signInAnonymously();
    const response = await authRequest('/link-social', {
      method: 'POST',
      headers: { cookie, 'expo-origin': APP_ORIGIN },
      body: await appleLinkBody('apple-raw-nonce', 'raw-nonce-1', 'raw-nonce-1'),
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { status: boolean }).status).toBe(true);

    const user = await pool.query<{ id: string; is_anonymous: boolean }>(
      'SELECT id, is_anonymous FROM auth."user" WHERE id = $1',
      [uid],
    );
    expect(user.rows[0]).toEqual({ id: uid, is_anonymous: false });
    const account = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM auth.account WHERE provider_id = 'apple' AND account_id = 'apple-raw-nonce'`,
    );
    expect(account.rows.map((row) => row.user_id)).toEqual([uid]);
  });

  it('accepts a token that carries the SHA-256 of the nonce the app sent', async () => {
    const { cookie, uid } = await signInAnonymously();
    const raw = 'raw-nonce-2';
    const hashed = createHash('sha256').update(raw).digest('hex');
    const response = await authRequest('/link-social', {
      method: 'POST',
      headers: { cookie, 'expo-origin': APP_ORIGIN },
      body: await appleLinkBody('apple-hashed-nonce', hashed, raw),
    });
    expect(response.status).toBe(200);
    const account = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM auth.account WHERE provider_id = 'apple' AND account_id = 'apple-hashed-nonce'`,
    );
    expect(account.rows.map((row) => row.user_id)).toEqual([uid]);
  });

  it('rejects a token whose nonce does not match what the app sent', async () => {
    const { cookie } = await signInAnonymously();
    const response = await authRequest('/link-social', {
      method: 'POST',
      headers: { cookie, 'expo-origin': APP_ORIGIN },
      body: await appleLinkBody('apple-wrong-nonce', 'the-real-nonce', 'another-nonce'),
    });
    expect(response.status).toBe(401);
  });
});
