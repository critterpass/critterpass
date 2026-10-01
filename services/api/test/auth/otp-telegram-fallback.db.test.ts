/**
 * Real Better Auth send-otp -> verify through the real Telegram Gateway and Prelude senders; only
 * their HTTP boundary is a recorded-fixture double. A number the Gateway cannot reach costs one
 * call (never `checkSendAbility` first) and the same code then goes out over Prelude SMS, which a
 * real verify accepts. A reachable number's Gateway request id is tracked for the delivery webhook.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { runMigrations } from '@cp/db';
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createAuthModule, type AuthModule } from '../../src/auth';
import { createPreludeSender } from '../../src/auth/otp/prelude';
import { findDeliveryByProviderMessageId } from '../../src/auth/otp/router';
import { createTelegramGatewaySender } from '../../src/auth/otp/telegram';
import type { HttpClient } from '../../src/auth/otp/whatsapp';
import { disabledAttestationConfig } from './test-attestation-config';

const FIXTURES_DIR = path.join(import.meta.dirname, '../fixtures/otp');

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let authModule: AuthModule | undefined;

interface RecordedCall {
  readonly url: string;
  readonly body: Record<string, unknown>;
}

/** Answers each provider URL with its recorded fixture and records every call. */
function recordedHttp(fixtures: Record<string, { file: string; status: number }>) {
  const calls: RecordedCall[] = [];
  const http: HttpClient = {
    fetch: (url, init) => {
      calls.push({ url, body: JSON.parse(init.body as string) as Record<string, unknown> });
      const match = Object.entries(fixtures).find(([suffix]) => url.endsWith(suffix));
      if (!match) return Promise.reject(new Error(`unexpected provider call ${url}`));
      const [, { file, status }] = match;
      return Promise.resolve(
        new Response(readFileSync(path.join(FIXTURES_DIR, file), 'utf8'), { status }),
      );
    },
  };
  return { http, calls };
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
  authModule = undefined;
});

function buildModule(http: HttpClient): AuthModule {
  return createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: 'test-secret-at-least-32-characters-long',
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: {
      telegram: createTelegramGatewaySender({ token: 'test-gateway-token', http }),
      prelude: createPreludeSender({ apiKey: 'test-prelude-key', http }),
    },
    rateLimit: {
      customRules: {
        '/sign-in/*': { window: 1, max: 1000 },
        '/phone-number/*': { window: 1, max: 1000 },
      },
    },
    attestation: disabledAttestationConfig(),
  });
}

async function authRequest(module: AuthModule, route: string, body: unknown, cookie?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookie) headers.set('cookie', cookie);
  return module.handler(
    new Request(`http://localhost:8787/api/auth${route}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
    }),
  );
}

async function anonymousSession(module: AuthModule): Promise<{ cookie: string; uid: string }> {
  const response = await authRequest(module, '/sign-in/anonymous', {});
  const cookie = /better-auth\.session_token=[^;]+/.exec(response.headers.get('set-cookie') ?? '');
  if (!cookie) throw new Error(`no session cookie (status ${response.status})`);
  const { user } = (await response.json()) as { user: { id: string } };
  return { cookie: cookie[0], uid: user.id };
}

describe('Telegram Gateway then Prelude SMS', () => {
  it('falls through to Prelude with one uncharged Gateway call when the number cannot receive codes', async () => {
    const { http, calls } = recordedHttp({
      '/sendVerificationMessage': {
        file: 'telegram-gateway-error-phone-number-invalid.json',
        status: 400,
      },
      '/verification': { file: 'prelude-verification-send-success.json', status: 201 },
    });
    authModule = buildModule(http);
    const { cookie, uid } = await anonymousSession(authModule);
    const phoneNumber = '+14155552671';

    const send = await authRequest(authModule, '/phone-number/send-otp', { phoneNumber }, cookie);
    expect(send.status).toBe(200);

    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/sendVerificationMessage',
      '/v2/verification',
    ]);
    const telegramCode = calls[0]?.body['code'];
    const smsCode = (calls[1]?.body['options'] as { custom_code?: string } | undefined)
      ?.custom_code;
    expect(smsCode).toBe(telegramCode);

    const verify = await authRequest(
      authModule,
      '/phone-number/verify',
      { phoneNumber, code: smsCode, updatePhoneNumber: true },
      cookie,
    );
    expect(verify.status).toBe(200);
    expect(((await verify.json()) as { user: { id: string } }).user.id).toBe(uid);
  });

  it('stops at Telegram when the Gateway accepts the code and tracks its request id', async () => {
    const { http, calls } = recordedHttp({
      '/sendVerificationMessage': { file: 'telegram-gateway-send-success.json', status: 200 },
    });
    authModule = buildModule(http);
    const { cookie, uid } = await anonymousSession(authModule);
    const phoneNumber = '+6598765432';

    const send = await authRequest(authModule, '/phone-number/send-otp', { phoneNumber }, cookie);
    expect(send.status).toBe(200);
    expect(calls).toHaveLength(1);

    const delivery = await findDeliveryByProviderMessageId(redis, '8f7e2c61b0a94c13');
    expect(delivery).toMatchObject({ channel: 'telegram', uid, phoneE164: phoneNumber });
  });
});
