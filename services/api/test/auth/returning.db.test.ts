/**
 * Returning-user sign-in (docs/api-contracts.md §5.1 `POST /api/auth/sign-in/phone-number`): a fresh
 * install with no anonymous session lands directly on the existing, already-registered uid. Wrong
 * code, no matching account, and code-enumeration lockout are each reported distinctly. Drives a real
 * Better Auth instance the same way link-social.db.test.ts/merge.db.test.ts do.
 */
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { runMigrations } from '@cp/db';
import { Hono } from 'hono';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuthModule, type AuthModule } from '../../src/auth';
import type { OtpChannelAdapter } from '../../src/auth/otp/router';
import { registerReturningPhoneSignInRoute } from '../../src/routes/auth-extra';

import { disabledAttestationConfig } from './test-attestation-config';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let authModule: AuthModule;
let app: Hono<{ Variables: object }>;
let capturedCodes: Map<string, string>;
const SECRET = 'test-secret-at-least-32-characters-long';
const PHONE = '+6592000001';

function fakeWhatsAppAdapter(): OtpChannelAdapter {
  return {
    send: ({ phoneE164, code }) => {
      capturedCodes.set(phoneE164, code);
      return Promise.resolve({ providerMessageId: `fake-wamid-${phoneE164}` });
    },
  };
}

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();
  capturedCodes = new Map();

  authModule = createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: SECRET,
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: { whatsapp: fakeWhatsAppAdapter() },
    rateLimit: {
      customRules: {
        '/sign-in/*': { window: 1, max: 1000 },
        '/phone-number/*': { window: 1, max: 1000 },
      },
    },
    attestation: disabledAttestationConfig(),
  });

  app = new Hono<{ Variables: object }>();
  registerReturningPhoneSignInRoute(app, { auth: authModule.auth, redis, secret: SECRET });
  app.on(['GET', 'POST'], '/api/auth/*', (c) => authModule.handler(c.req.raw));
}, 180_000);

afterAll(async () => {
  await authModule.close();
  redis.destroy();
  await pool.end();
  await Promise.all([postgres.stop(), redisContainer.stop()]);
});

async function authRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return app.request(`http://localhost:8787${path}`, { ...init, headers });
}

/** Registers a uid via anonymous sign-in + phone verify (the anonymous upgrade path, T4), so a matching phoneNumberVerified user exists to return to. */
async function registerExistingUser(phoneNumber: string): Promise<string> {
  const signIn = await authRequest('/api/auth/sign-in/anonymous', { method: 'POST', body: '{}' });
  const setCookie = signIn.headers.get('set-cookie');
  const cookie = /better-auth\.session_token=[^;]+/.exec(setCookie ?? '')?.[0];
  const { user } = (await signIn.json()) as { user: { id: string } };
  await authRequest('/api/auth/phone-number/send-otp', {
    method: 'POST',
    headers: { cookie: cookie ?? '' },
    body: JSON.stringify({ phoneNumber }),
  });
  const code = capturedCodes.get(phoneNumber);
  if (!code) throw new Error(`no code captured for ${phoneNumber}`);
  const verify = await authRequest('/api/auth/phone-number/verify', {
    method: 'POST',
    headers: { cookie: cookie ?? '' },
    body: JSON.stringify({ phoneNumber, code, updatePhoneNumber: true }),
  });
  if (verify.status !== 200) throw new Error(`verify failed: ${await verify.text()}`);
  return user.id;
}

async function sendReturningOtp(phoneNumber: string): Promise<string> {
  await authRequest('/api/auth/phone-number/send-otp', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber }),
  });
  const code = capturedCodes.get(phoneNumber);
  if (!code) throw new Error(`no code captured for ${phoneNumber}`);
  return code;
}

describe('returning sign-in: phone', () => {
  it('lands a fresh install (no anonymous session) directly on the existing uid', async () => {
    const uid = await registerExistingUser(PHONE);

    const code = await sendReturningOtp(PHONE);
    const response = await authRequest('/api/auth/sign-in/phone-number', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: PHONE, code }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string; user: { id: string } };
    expect(body.user.id).toBe(uid);
    expect(response.headers.get('set-cookie')).toContain('better-auth.session_token=');

    const cookie = /better-auth\.session_token=[^;]+/.exec(
      response.headers.get('set-cookie') ?? '',
    )?.[0];
    const session = await authRequest('/api/auth/get-session', {
      headers: { cookie: cookie ?? '' },
    });
    expect(session.status).toBe(200);
    const sessionBody = (await session.json()) as { user: { id: string } };
    expect(sessionBody.user.id).toBe(uid);
  });

  it('rejects a wrong code without signing anyone in', async () => {
    const phone = '+6592000002';
    await registerExistingUser(phone);
    await sendReturningOtp(phone);

    const response = await authRequest('/api/auth/sign-in/phone-number', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: phone, code: '000000' }),
    });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION');
  });

  it('reports no account for a phone number that never registered', async () => {
    const phone = '+6592000003';
    const code = await sendReturningOtp(phone);
    const response = await authRequest('/api/auth/sign-in/phone-number', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: phone, code }),
    });
    expect(response.status).toBe(404);
  });

  it('locks out after repeated wrong codes', async () => {
    const phone = '+6592000004';
    await registerExistingUser(phone);
    let last: Response | undefined;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await sendReturningOtp(phone);
      last = await authRequest('/api/auth/sign-in/phone-number', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone, code: '000000' }),
      });
    }
    expect(last?.status).toBe(429);
    const body = (await last?.json()) as {
      error: { code: string; detail: { retry_after_s: number } };
    };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.detail.retry_after_s).toBeGreaterThan(0);
  });
});
