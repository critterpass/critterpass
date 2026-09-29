/**
 * Fixed-code phone numbers through a real Better Auth instance (Testcontainers Postgres + Redis):
 * a staging test number and the App Review number verify with their fixed code and never reach a
 * provider, a wrong code is still refused, production ignores test numbers, and every other number
 * keeps its delivered random code. The WhatsApp channel is a capturing double at the network
 * boundary, as in otp.db.test.ts.
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
import { fixedCodeNumbersFromEnv, type FixedCodeEnv } from '../../src/auth/otp/fixed-codes';
import { disabledAttestationConfig } from './test-attestation-config';

const TEST_NUMBER = '+6591234567';
const REVIEW_NUMBER = '+6580000001';
const REAL_NUMBER = '+6598765432';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let authModule: AuthModule | undefined;
let sent: string[];
let uses: { kind: string; number: string }[];

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();
}, 180_000);

afterAll(async () => {
  await pool.end();
  redis.destroy();
  await Promise.all([postgres.stop(), redisContainer.stop()]);
});

afterEach(async () => {
  await authModule?.close();
  authModule = undefined;
  // Each case starts inside fresh per-number send limits (3 per 10 minutes).
  await redis.flushAll();
});

function buildModule(env: FixedCodeEnv): AuthModule {
  sent = [];
  uses = [];
  return createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: 'test-secret-at-least-32-characters-long',
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: {
      whatsapp: {
        send: ({ phoneE164 }) => {
          sent.push(phoneE164);
          return Promise.resolve({});
        },
      },
    },
    fixedCodes: fixedCodeNumbersFromEnv(env),
    onFixedCode: (use) => uses.push(use),
    rateLimit: {
      customRules: {
        '/sign-in/*': { window: 1, max: 1000 },
        '/phone-number/*': { window: 1, max: 1000 },
      },
    },
    attestation: disabledAttestationConfig(),
  });
}

const STAGING: FixedCodeEnv = {
  APP_ENV: 'staging',
  OTP_TEST_NUMBERS: `${TEST_NUMBER}, +6591234568`,
  OTP_TEST_CODE: '246810',
  OTP_REVIEW_NUMBER: REVIEW_NUMBER,
  OTP_REVIEW_CODE: '135790',
};

async function post(module: AuthModule, path: string, body: unknown, cookie: string) {
  return module.handler(
    new Request(`http://localhost:8787/api/auth${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', cookie },
    }),
  );
}

async function anonymous(module: AuthModule): Promise<{ cookie: string; uid: string }> {
  const response = await module.handler(
    new Request('http://localhost:8787/api/auth/sign-in/anonymous', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    }),
  );
  const cookie = /better-auth\.session_token=[^;]+/.exec(
    response.headers.get('set-cookie') ?? '',
  )?.[0];
  if (cookie === undefined) throw new Error(`no session cookie (status ${response.status})`);
  const { user } = (await response.json()) as { user: { id: string } };
  return { cookie, uid: user.id };
}

async function sendAndVerify(module: AuthModule, phoneNumber: string, code: string) {
  const { cookie, uid } = await anonymous(module);
  const send = await post(module, '/phone-number/send-otp', { phoneNumber }, cookie);
  expect(send.status).toBe(200);
  const verify = await post(
    module,
    '/phone-number/verify',
    { phoneNumber, code, updatePhoneNumber: true },
    cookie,
  );
  return { uid, verify };
}

describe('fixed-code phone numbers', { timeout: 60_000 }, () => {
  it('verifies a staging test number with the fixed code and sends nothing', async () => {
    authModule = buildModule(STAGING);
    const { uid, verify } = await sendAndVerify(authModule, TEST_NUMBER, '246810');
    expect(verify.status).toBe(200);
    const body = (await verify.json()) as { user: { id: string; phoneNumber: string } };
    expect(body.user).toMatchObject({ id: uid, phoneNumber: TEST_NUMBER });
    expect(sent).toEqual([]);
    expect(uses).toEqual([{ kind: 'test', number: '…4567' }]);
  });

  it('still refuses a wrong code for a test number', async () => {
    authModule = buildModule(STAGING);
    const { verify } = await sendAndVerify(authModule, '+6591234568', '000000');
    expect(verify.status).toBe(400);
    expect(sent).toEqual([]);
  });

  it('verifies the App Review number in production, where test numbers are ignored', async () => {
    const production: FixedCodeEnv = { ...STAGING, APP_ENV: 'production' };
    authModule = buildModule(production);
    const review = await sendAndVerify(authModule, REVIEW_NUMBER, '135790');
    expect(review.verify.status).toBe(200);
    expect(uses).toEqual([{ kind: 'review', number: '…0001' }]);

    const test = await sendAndVerify(authModule, TEST_NUMBER, '246810');
    expect(test.verify.status).toBe(400);
    expect(sent).toEqual([TEST_NUMBER]);
  });

  it('moves a test number to the newest pass that saves it, never an App Review number', async () => {
    const review = '+6580000002';
    authModule = buildModule({ ...STAGING, OTP_REVIEW_NUMBER: review });
    const first = await sendAndVerify(authModule, TEST_NUMBER, '246810');
    expect(first.verify.status).toBe(200);
    const second = await sendAndVerify(authModule, TEST_NUMBER, '246810');
    expect(second.verify.status).toBe(200);
    const { rows } = await pool.query<{ id: string; phone: string | null }>(
      'SELECT id::text AS id, phone_number AS phone FROM auth."user" WHERE id::text = ANY ($1::text[])',
      [[first.uid, second.uid]],
    );
    expect(Object.fromEntries(rows.map((row) => [row.id, row.phone]))).toEqual({
      [first.uid]: null,
      [second.uid]: TEST_NUMBER,
    });

    expect((await sendAndVerify(authModule, review, '135790')).verify.status).toBe(200);
    const taken = await sendAndVerify(authModule, review, '135790');
    expect(taken.verify.status).toBe(409);
  });

  it('delivers a random code to every other number', async () => {
    authModule = buildModule(STAGING);
    const { verify } = await sendAndVerify(authModule, REAL_NUMBER, '246810');
    expect(verify.status).toBe(400);
    expect(sent).toEqual([REAL_NUMBER]);
    expect(uses).toEqual([]);
  });
});

describe('fixed-code configuration', () => {
  it('has no numbers when nothing is set, and fails fast on half a pair or a bad number', () => {
    expect(fixedCodeNumbersFromEnv({ APP_ENV: 'staging' })).toBeUndefined();
    expect(() =>
      fixedCodeNumbersFromEnv({ APP_ENV: 'staging', OTP_TEST_NUMBERS: TEST_NUMBER }),
    ).toThrow(/set together/);
    expect(() =>
      fixedCodeNumbersFromEnv({ APP_ENV: 'staging', OTP_REVIEW_CODE: '123456' }),
    ).toThrow(/set together/);
    expect(() =>
      fixedCodeNumbersFromEnv({
        APP_ENV: 'staging',
        OTP_TEST_NUMBERS: '91234567',
        OTP_TEST_CODE: '123456',
      }),
    ).toThrow(/E\.164/);
    const warnings: string[] = [];
    expect(
      fixedCodeNumbersFromEnv(
        { APP_ENV: 'production', OTP_TEST_NUMBERS: TEST_NUMBER, OTP_TEST_CODE: '123456' },
        (warning) => warnings.push(warning),
      ),
    ).toBeUndefined();
    expect(warnings).toEqual([expect.stringContaining('never honours test numbers')]);
  });
});
