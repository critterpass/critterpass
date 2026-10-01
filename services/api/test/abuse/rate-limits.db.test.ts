/**
 * Proves services/api/src/auth/hooks.ts's combined `hooks.before`/`hooks.after` middleware actually
 * reaches `/phone-number/send-otp`'s real request body and headers at runtime — the unit tests in
 * rate-limits.test.ts and pumping.test.ts exercise the same functions directly, but only a real
 * Better Auth request proves `ctx.body`/`ctx.headers` are what services/api/src/auth/hooks.ts assumes
 * them to be at the point `hooks.before` runs.
 */
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { runMigrations } from '@cp/db';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createAuthModule, type AuthModule } from '../../src/auth';
import type { OtpChannelAdapter } from '../../src/auth/otp/router';
import { disabledAttestationConfig } from '../auth/test-attestation-config';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let authModule: AuthModule;

function fakeWhatsAppAdapter(): OtpChannelAdapter {
  return { send: () => Promise.resolve({ providerMessageId: 'fake-wamid' }) };
}

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();
}, 180_000);

afterAll(async () => {
  await pool?.end();
  redis?.destroy();
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

afterEach(async () => {
  await authModule?.close();
});

beforeEach(async () => {
  await redis.flushAll();
  authModule = createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: 'test-secret-at-least-32-characters-long',
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
});

function authRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type'))
    headers.set('content-type', 'application/json');
  return authModule.handler(
    new Request(`http://localhost:8787/api/auth${path}`, { ...init, headers }),
  );
}

async function signInAndGetCookie(): Promise<string> {
  const response = await authRequest('/sign-in/anonymous', { method: 'POST', body: '{}' });
  const setCookie = response.headers.get('set-cookie');
  const cookie = /better-auth\.session_token=[^;]+/.exec(setCookie ?? '')?.[0];
  if (!cookie) throw new Error(`sign-in/anonymous had no cookie (status ${response.status})`);
  return cookie;
}

describe('send-otp rate limiting: live-wired through a real request', () => {
  it('rejects the 4th send-otp within 10 minutes for the same phone number with RATE_LIMITED', async () => {
    const cookie = await signInAndGetCookie();
    const phoneNumber = '+6598765432';
    for (let i = 0; i < 3; i += 1) {
      const response = await authRequest('/phone-number/send-otp', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber }),
        headers: { cookie },
      });
      expect(response.status).toBe(200);
    }
    const fourth = await authRequest('/phone-number/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
      headers: { cookie },
    });
    expect(fourth.status).toBe(429);
    const body = (await fourth.json()) as {
      error: { code: string; detail: { retry_after_s: number } };
    };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.detail.retry_after_s).toBeGreaterThan(0);
  });

  it('rejects send-otp for a country outside the pumping allow-list with VALIDATION/country_unsupported', async () => {
    const cookie = await signInAndGetCookie();
    // +86 (China) is not in defaultPumpingConfig()'s starter allow-list.
    const response = await authRequest('/phone-number/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '+8613800000001' }),
      headers: { cookie },
    });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string; detail: { reason: string } } };
    expect(body.error.code).toBe('VALIDATION');
    expect(body.error.detail.reason).toBe('country_unsupported');
  });
});
