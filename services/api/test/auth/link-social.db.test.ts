/**
 * uid identical before/after link for both providers; implicit linking by email disabled (second
 * provider with same email does not auto-link); revoke calls Apple's endpoint with the stored token.
 * Verification runs through the real `@better-auth/core` id-token verifier (issuer/audience/nonce/
 * expiry, RS256 signature all real) against real Apple/Google-shaped provider config; only the
 * network boundary — Apple's `/auth/keys` and Google's `/oauth2/v3/certs` JWKS endpoints — is doubled
 * by stubbing `fetch` to serve a locally-generated JWKS instead of the real internet.
 */
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { runMigrations } from '@cp/db';
import { generateKeyPair } from 'jose';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createAuthModule, type AuthModule } from '../../src/auth';
import { revokeApple } from '../../src/auth/social/revoke';
import type { AppleClientSecretConfig, AppleHttpClient } from '../../src/auth/social/apple';

import { disabledAttestationConfig } from './test-attestation-config';
import { buildLocalIssuer, jwksResponse } from './test-id-token-issuer';

const APPLE_CLIENT_ID = 'app.critterpass.test';
const GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let authModule: AuthModule;
let issueAppleToken: (claims: Record<string, unknown>) => Promise<string>;
let issueGoogleToken: (claims: Record<string, unknown>) => Promise<string>;

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();

  const apple = await buildLocalIssuer();
  const google = await buildLocalIssuer();
  issueAppleToken = (claims) =>
    apple.sign({ iss: 'https://appleid.apple.com', aud: APPLE_CLIENT_ID, ...claims });
  issueGoogleToken = (claims) =>
    google.sign({
      iss: 'https://accounts.google.com',
      aud: GOOGLE_CLIENT_ID,
      given_name: 'Test',
      family_name: 'User',
      ...claims,
    });

  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(APPLE_JWKS_URL)) return jwksResponse(apple.jwks);
    if (url.startsWith(GOOGLE_JWKS_URL)) return jwksResponse(google.jwks);
    return realFetch(input, init);
  });

  authModule = createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: 'test-secret-at-least-32-characters-long',
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: {},
    rateLimit: {
      customRules: {
        '/sign-in/*': { window: 1, max: 1000 },
        '/link-social': { window: 1, max: 1000 },
      },
    },
    attestation: disabledAttestationConfig(),
    apple: { clientId: APPLE_CLIENT_ID },
    google: { clientIds: [GOOGLE_CLIENT_ID] },
  });
}, 180_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await authModule.close();
  redis.destroy();
  await pool.end();
  await Promise.all([postgres.stop(), redisContainer.stop()]);
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

describe('link-social: Apple', () => {
  it('keeps the uid identical and flips the account to registered', async () => {
    const { cookie, uid } = await signInAnonymously();
    const nonce = 'apple-nonce-1';
    const token = await issueAppleToken({
      sub: 'apple-subject-1',
      email: 'apple-user-1@example.com',
      email_verified: true,
      name: 'Apple User',
      nonce,
    });

    const response = await authRequest('/link-social', {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({ provider: 'apple', idToken: { token, nonce } }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: boolean };
    expect(body.status).toBe(true);

    const authRow = await pool.query<{ id: string; is_anonymous: boolean }>(
      'SELECT id, is_anonymous FROM auth."user" WHERE id = $1',
      [uid],
    );
    expect(authRow.rows[0]?.id).toBe(uid);
    expect(authRow.rows[0]?.is_anonymous).toBe(false);

    const publicRow = await pool.query<{ status: string }>(
      'SELECT status FROM users WHERE id = $1',
      [uid],
    );
    expect(publicRow.rows[0]?.status).toBe('registered');

    const accountRow = await pool.query(
      `SELECT 1 FROM auth.account WHERE user_id = $1 AND provider_id = 'apple'`,
      [uid],
    );
    expect(accountRow.rowCount).toBe(1);
  });
});

describe('link-social: Google', () => {
  it('keeps the uid identical and flips the account to registered', async () => {
    const { cookie, uid } = await signInAnonymously();
    const nonce = 'google-nonce-1';
    const token = await issueGoogleToken({
      sub: 'google-subject-1',
      email: 'google-user-1@example.com',
      email_verified: true,
      name: 'Google User',
      picture: 'https://example.com/avatar.png',
      nonce,
    });

    const response = await authRequest('/link-social', {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({ provider: 'google', idToken: { token, nonce } }),
    });
    expect(response.status).toBe(200);

    const authRow = await pool.query<{ id: string; is_anonymous: boolean }>(
      'SELECT id, is_anonymous FROM auth."user" WHERE id = $1',
      [uid],
    );
    expect(authRow.rows[0]?.id).toBe(uid);
    expect(authRow.rows[0]?.is_anonymous).toBe(false);
  });

  it('rejects a token whose nonce does not match', async () => {
    const { cookie } = await signInAnonymously();
    const token = await issueGoogleToken({
      sub: 'google-subject-nonce-mismatch',
      email: 'google-nonce-mismatch@example.com',
      email_verified: true,
      name: 'Nonce Mismatch',
      nonce: 'the-real-nonce',
    });
    const response = await authRequest('/link-social', {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({ provider: 'google', idToken: { token, nonce: 'a-different-nonce' } }),
    });
    expect(response.status).toBe(401);
  });
});

describe('implicit linking is disabled', () => {
  it('does not auto-link a second provider sharing an existing registered user email', async () => {
    // A returning-style sign-up (no anonymous session): `/sign-in/social` for a brand-new identity
    // writes the real email onto `auth.user.email`, unlike an anonymous-session `/link-social`
    // (which never touches the anonymous placeholder email without `updateUserInfoOnLink`) — this is
    // the one path where a genuine email match against an existing user can occur.
    const sharedEmail = 'shared-email@example.com';
    const appleNonce = 'shared-apple-nonce';
    const appleToken = await issueAppleToken({
      sub: 'apple-subject-shared',
      email: sharedEmail,
      email_verified: true,
      name: 'Shared Email User',
      nonce: appleNonce,
    });
    const firstSignIn = await authRequest('/sign-in/social', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'apple',
        idToken: { token: appleToken, nonce: appleNonce },
      }),
    });
    expect(firstSignIn.status).toBe(200);
    const firstBody = (await firstSignIn.json()) as { user: { id: string } };

    // A second, distinct identity (Google) presenting the SAME email must not silently attach to the
    // Apple-registered user: disableImplicitLinking rejects it instead of merging identities behind
    // the scenes.
    const googleNonce = 'shared-google-nonce';
    const googleToken = await issueGoogleToken({
      sub: 'google-subject-shared',
      email: sharedEmail,
      email_verified: true,
      name: 'Shared Email User',
      nonce: googleNonce,
    });
    const secondSignIn = await authRequest('/sign-in/social', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'google',
        idToken: { token: googleToken, nonce: googleNonce },
      }),
    });
    expect(secondSignIn.status).toBe(401);

    const googleAccountRow = await pool.query(
      `SELECT user_id FROM auth.account WHERE provider_id = 'google' AND account_id = 'google-subject-shared'`,
    );
    expect(googleAccountRow.rowCount).toBe(0);

    // The Apple-registered user is untouched: still exactly one account, still their own uid.
    const appleAccountRow = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM auth.account WHERE provider_id = 'apple' AND account_id = 'apple-subject-shared'`,
    );
    expect(appleAccountRow.rows[0]?.user_id).toBe(firstBody.user.id);
  });
});

describe('revokeApple', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls the Apple revoke endpoint with the decrypted stored refresh token', async () => {
    const { cookie, uid } = await signInAnonymously();
    const nonce = 'revoke-nonce';
    const token = await issueAppleToken({
      sub: 'apple-subject-revoke',
      email: 'revoke-user@example.com',
      email_verified: true,
      name: 'Revoke User',
      nonce,
    });
    await authRequest('/link-social', {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({ provider: 'apple', idToken: { token, nonce } }),
    });

    const { crypto: dbCrypto } = await import('@cp/db');
    const keyring = {
      activeKeyId: 'k1',
      keys: { k1: Buffer.alloc(32, 7) },
    };
    const stored = dbCrypto.encryptField('captured-refresh-token', keyring);
    const accountRow = await pool.query<{ id: string }>(
      `SELECT id FROM auth.account WHERE provider_id = 'apple' AND user_id = $1`,
      [uid],
    );
    await pool.query('UPDATE auth.account SET refresh_token = $2 WHERE id = $1', [
      accountRow.rows[0]?.id,
      stored,
    ]);

    const seenCalls: Array<{ url: string; body: string }> = [];
    const http: AppleHttpClient = {
      fetch: (url, init) => {
        seenCalls.push({ url, body: typeof init.body === 'string' ? init.body : '' });
        return Promise.resolve(new Response('{}', { status: 200 }));
      },
    };
    const clientSecretConfig: AppleClientSecretConfig = {
      teamId: 'TEAMID1234',
      keyId: 'KEYID1234',
      clientId: APPLE_CLIENT_ID,
      privateKeyPem: await generateTestEcPkcs8Pem(),
    };

    await revokeApple(uid, { auth: authModule.auth, keyring, clientSecretConfig, http });

    expect(seenCalls).toHaveLength(1);
    expect(seenCalls[0]?.url).toBe('https://appleid.apple.com/auth/revoke');
    expect(seenCalls[0]?.body).toContain('token=captured-refresh-token');

    const cleared = await pool.query<{ refresh_token: string | null }>(
      'SELECT refresh_token FROM auth.account WHERE id = $1',
      [accountRow.rows[0]?.id],
    );
    expect(cleared.rows[0]?.refresh_token).toBeNull();
  });

  it('is a no-op when the uid never linked Apple', async () => {
    const { uid } = await signInAnonymously();
    const fetchSpy = vi.fn();
    const http: AppleHttpClient = { fetch: fetchSpy };
    await revokeApple(uid, {
      auth: authModule.auth,
      keyring: { activeKeyId: 'k1', keys: { k1: Buffer.alloc(32, 1) } },
      clientSecretConfig: {
        teamId: 'TEAMID1234',
        keyId: 'KEYID1234',
        clientId: APPLE_CLIENT_ID,
        privateKeyPem: await generateTestEcPkcs8Pem(),
      },
      http,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/** A throwaway ES256 private key in PKCS8 PEM form, valid input for `generateAppleClientSecret`'s `importPKCS8`. */
async function generateTestEcPkcs8Pem(): Promise<string> {
  const { exportPKCS8 } = await import('jose');
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  return exportPKCS8(privateKey);
}
