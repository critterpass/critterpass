/**
 * Sign-up and phone-code kill switches over a real Better Auth instance (Testcontainers Postgres +
 * Redis): `signup.enabled` off refuses every new user but lets a returning user sign in, and the OTP
 * router skips a switched-off channel, answering `switched_off` only when every channel is off. The
 * OTP channels are fake adapters (network-boundary doubles) that capture the code.
 */
import { runMigrations } from '@cp/db';
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { Hono } from 'hono';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createAuthModule, type AuthModule } from '../../src/auth';
import type { OtpChannel } from '../../src/auth/otp/countries';
import type { OtpChannelAdapter } from '../../src/auth/otp/router';
import { createKillSwitches } from '../../src/ops/kill-switches';
import { registerReturningPhoneSignInRoute } from '../../src/routes/auth-extra';
import { disabledAttestationConfig } from './test-attestation-config';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let authModule: AuthModule;
let app: Hono<{ Variables: object }>;
const SECRET = 'test-secret-at-least-32-characters-long';
/** The switches' clock: moved past the read cache after every flip. */
let clock = Date.now();
const sent: { channel: OtpChannel; phone: string; code: string }[] = [];

function adapter(channel: OtpChannel): OtpChannelAdapter {
  return {
    send: ({ phoneE164, code }) => {
      sent.push({ channel, phone: phoneE164, code });
      return Promise.resolve({ providerMessageId: `fake-${channel}-${sent.length}` });
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
  authModule = createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: SECRET,
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: {
      whatsapp: adapter('whatsapp'),
      telegram: adapter('telegram'),
      prelude: adapter('prelude'),
    },
    rateLimit: {
      customRules: {
        '/sign-in/*': { window: 1, max: 1000 },
        '/phone-number/*': { window: 1, max: 1000 },
      },
    },
    attestation: disabledAttestationConfig(),
    switches: createKillSwitches(pool, { now: () => new Date(clock) }),
  });
  app = new Hono<{ Variables: object }>();
  registerReturningPhoneSignInRoute(app, { auth: authModule.auth, redis, secret: SECRET });
  app.on(['GET', 'POST'], '/api/auth/*', (c) => authModule.handler(c.req.raw));
}, 180_000);

afterAll(async () => {
  await authModule?.close();
  redis?.destroy();
  await pool?.end();
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

beforeEach(async () => {
  await pool.query("DELETE FROM ops.ops_config WHERE key LIKE '%.enabled'");
  clock += 10_000;
  sent.length = 0;
});

async function setSwitch(key: string, on: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO ops.ops_config (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(on)],
  );
  clock += 10_000;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  return app.request(`http://localhost:8787${path}`, { ...init, headers });
}

function lastCode(phone: string): string {
  const code = sent.findLast((entry) => entry.phone === phone)?.code;
  if (code === undefined) throw new Error(`no code sent to ${phone}`);
  return code;
}

async function sendOtp(phoneNumber: string, cookie = ''): Promise<Response> {
  return request('/api/auth/phone-number/send-otp', {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({ phoneNumber }),
  });
}

async function registeredUser(phoneNumber: string): Promise<string> {
  const signIn = await request('/api/auth/sign-in/anonymous', { method: 'POST', body: '{}' });
  const cookie = /better-auth\.session_token=[^;]+/.exec(signIn.headers.get('set-cookie') ?? '');
  const { user } = (await signIn.json()) as { user: { id: string } };
  await sendOtp(phoneNumber, cookie?.[0]);
  const verify = await request('/api/auth/phone-number/verify', {
    method: 'POST',
    headers: { cookie: cookie?.[0] ?? '' },
    body: JSON.stringify({ phoneNumber, code: lastCode(phoneNumber), updatePhoneNumber: true }),
  });
  expect(verify.status).toBe(200);
  return user.id;
}

const userCount = async () =>
  Number((await pool.query<{ n: string }>('SELECT count(*) AS n FROM users')).rows[0]?.n);

function expectSwitchedOff(body: unknown, key: string): void {
  expect(body).toMatchObject({
    error: { code: 'STATE_INVALID', retryable: false, detail: { reason: 'switched_off', key } },
  });
}

describe('sign-up kill switch', () => {
  it('refuses new users while off, lets a returning user in, and applies on the next read', async () => {
    const phone = '+6592100001';
    const uid = await registeredUser(phone);
    await setSwitch('signup.enabled', false);
    const before = await userCount();

    const anonymous = await request('/api/auth/sign-in/anonymous', { method: 'POST', body: '{}' });
    expect(anonymous.status).toBe(409);
    expectSwitchedOff(await anonymous.json(), 'signup.enabled');
    expect(await userCount()).toBe(before);

    await sendOtp(phone);
    const returning = await request('/api/auth/sign-in/phone-number', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: phone, code: lastCode(phone) }),
    });
    expect(returning.status).toBe(200);
    expect(((await returning.json()) as { user: { id: string } }).user.id).toBe(uid);

    await setSwitch('signup.enabled', true);
    const again = await request('/api/auth/sign-in/anonymous', { method: 'POST', body: '{}' });
    expect(again.status).toBe(200);
    expect(await userCount()).toBe(before + 1);
  });
});

describe('phone-code channel kill switches', () => {
  const phone = '+6592100002';

  it('sends over WhatsApp first while every channel is on', async () => {
    expect((await sendOtp(phone)).status).toBe(200);
    expect(sent.map((entry) => entry.channel)).toEqual(['whatsapp']);
  });

  it('falls through to Telegram when WhatsApp is switched off', async () => {
    await setSwitch('otp.whatsapp.enabled', false);
    expect((await sendOtp(phone)).status).toBe(200);
    expect(sent.map((entry) => entry.channel)).toEqual(['telegram']);
  });

  it('falls through to SMS when WhatsApp and Telegram are switched off', async () => {
    await setSwitch('otp.whatsapp.enabled', false);
    await setSwitch('otp.telegram.enabled', false);
    expect((await sendOtp('+6592100003')).status).toBe(200);
    expect(sent.map((entry) => entry.channel)).toEqual(['prelude']);
  });

  it('answers switched_off only when every channel is off', async () => {
    await setSwitch('otp.whatsapp.enabled', false);
    await setSwitch('otp.telegram.enabled', false);
    await setSwitch('otp.prelude.enabled', false);
    const response = await sendOtp(phone);
    expect(response.status).toBe(409);
    expectSwitchedOff(await response.json(), 'otp.whatsapp.enabled');
    expect(sent).toHaveLength(0);
  });
});
