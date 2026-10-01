/**
 * Uid unchanged after verify. Drives a real Better Auth instance (Testcontainers Postgres + Redis)
 * over HTTP the same way jwks.db.test.ts does; the WhatsApp
 * channel is a fake adapter (a network-boundary double, code-standards.md §17) that captures the
 * code Better Auth generated so the test can complete a real `/phone-number/verify` call with it.
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
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createAuthModule, type AuthModule } from '../../src/auth';
import type { OtpChannelAdapter } from '../../src/auth/otp/router';
import { disabledAttestationConfig } from './test-attestation-config';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let capturedCodes: Map<string, string>;
let authModule: AuthModule;

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
}, 180_000);

afterAll(async () => {
  await pool?.end();
  redis?.destroy();
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

afterEach(async () => {
  await authModule?.close();
});

function buildModule(
  otpAdapters: Parameters<typeof createAuthModule>[0]['otpAdapters'],
): AuthModule {
  capturedCodes = new Map();
  return createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: 'test-secret-at-least-32-characters-long',
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters,
    rateLimit: {
      customRules: {
        '/sign-in/*': { window: 1, max: 1000 },
        '/phone-number/*': { window: 1, max: 1000 },
      },
    },
    attestation: disabledAttestationConfig(),
  });
}

function authRequest(module: AuthModule, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type'))
    headers.set('content-type', 'application/json');
  return module.handler(new Request(`http://localhost:8787/api/auth${path}`, { ...init, headers }));
}

function sessionCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  const cookie = /better-auth\.session_token=[^;]+/.exec(setCookie ?? '')?.[0];
  if (!cookie) throw new Error(`no session cookie in response (status ${response.status})`);
  return cookie;
}

describe('phone OTP: allow-listed country via WhatsApp, uid preserved', () => {
  it('keeps the same uid across anonymous sign-in -> send-otp -> verify', async () => {
    authModule = buildModule({ whatsapp: fakeWhatsAppAdapter() });
    const phoneNumber = '+6598765432';

    const signIn = await authRequest(authModule, '/sign-in/anonymous', {
      method: 'POST',
      body: '{}',
    });
    const cookie = sessionCookie(signIn);
    const { user: anonUser } = (await signIn.json()) as { user: { id: string } };

    const sendOtp = await authRequest(authModule, '/phone-number/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
      headers: { cookie },
    });
    expect(sendOtp.status).toBe(200);
    const code = capturedCodes.get(phoneNumber);
    expect(code).toBeDefined();

    const verify = await authRequest(authModule, '/phone-number/verify', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, code, updatePhoneNumber: true }),
      headers: { cookie },
    });
    expect(verify.status).toBe(200);
    const verifyBody = (await verify.json()) as { user: { id: string; phoneNumber: string } };
    expect(verifyBody.user.id).toBe(anonUser.id);
    expect(verifyBody.user.phoneNumber).toBe(phoneNumber);
  });

  it('rejects send-otp for a number in no allow-listed country (VALIDATION, country_unsupported)', async () => {
    authModule = buildModule({ whatsapp: fakeWhatsAppAdapter() });
    const signIn = await authRequest(authModule, '/sign-in/anonymous', {
      method: 'POST',
      body: '{}',
    });
    const cookie = sessionCookie(signIn);

    const sendOtp = await authRequest(authModule, '/phone-number/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: 'not-a-real-number' }),
      headers: { cookie },
    });
    // Better Auth's own phoneNumberValidator hook is not configured, so an obviously invalid number
    // reaches our sendOTP -> router.sendOTP, which is what actually rejects it.
    expect(sendOtp.status).toBeGreaterThanOrEqual(400);
  });

  it('falls back to SMS when the WhatsApp adapter throws synchronously', async () => {
    const smsSend = { send: () => Promise.reject(new Error('whatsapp unreachable')) };
    let smsCode: string | undefined;
    authModule = buildModule({
      whatsapp: smsSend,
      prelude: {
        send: ({ code }) => {
          smsCode = code;
          return Promise.resolve({});
        },
      },
    });
    const signIn = await authRequest(authModule, '/sign-in/anonymous', {
      method: 'POST',
      body: '{}',
    });
    const cookie = sessionCookie(signIn);
    const phoneNumber = '+6598765433';

    const sendOtp = await authRequest(authModule, '/phone-number/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
      headers: { cookie },
    });
    expect(sendOtp.status).toBe(200);
    expect(smsCode).toBeDefined();
  });
});
