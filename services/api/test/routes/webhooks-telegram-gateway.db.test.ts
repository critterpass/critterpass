/**
 * A signed Telegram Gateway `expired` report for a tracked request emits `otp.channel_failed` on
 * `user:#uid`; unsigned, badly signed or stale reports never do.
 */
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { runMigrations, withSystem } from '@cp/db';
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { Hono } from 'hono';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRedisOtpDeliveryTracker } from '../../src/auth/otp/router';
import { registerTelegramGatewayWebhookRoutes } from '../../src/routes/webhooks-telegram-gateway';

const TOKEN = 'test-gateway-token';
const NOW_SECONDS = 1_759_068_100;
const REPORT = readFileSync(
  path.join(import.meta.dirname, '../fixtures/otp/telegram-gateway-report-expired.json'),
  'utf8',
);

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let app: Hono<{ Variables: object }>;

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();

  app = new Hono<{ Variables: object }>();
  registerTelegramGatewayWebhookRoutes(app, {
    appPool: pool,
    redis,
    token: TOKEN,
    now: () => NOW_SECONDS * 1000,
  });
}, 180_000);

afterAll(async () => {
  await pool?.end();
  redis?.destroy();
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

function sign(timestamp: string, body: string, token = TOKEN): string {
  const key = createHash('sha256').update(token).digest();
  return createHmac('sha256', key).update(`${timestamp}\n${body}`).digest('hex');
}

function report(requestId: string, status: string): string {
  const parsed = JSON.parse(REPORT) as Record<string, unknown>;
  return JSON.stringify({ ...parsed, request_id: requestId, delivery_status: { status } });
}

function post(body: string, headers: Record<string, string>) {
  return app.request('/webhooks/telegram-gateway', { method: 'POST', body, headers });
}

async function track(requestId: string, uid: string): Promise<void> {
  await createRedisOtpDeliveryTracker(redis).recordDelivery({
    providerMessageId: requestId,
    channel: 'telegram',
    uid,
    verificationId: `verification-${requestId}`,
    phoneE164: '+6598765432',
  });
}

async function channelFailedRows(uid: string) {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ payload: unknown }>('SELECT payload FROM rt_outbox WHERE channel = $1', [
      `user:#${uid}`,
    ]),
  );
  return rows;
}

describe('POST /webhooks/telegram-gateway', () => {
  const timestamp = String(NOW_SECONDS - 5);

  it('rejects a report with no signature', async () => {
    expect((await post(REPORT, { 'X-Request-Timestamp': timestamp })).status).toBe(401);
  });

  it('rejects a report signed with another token', async () => {
    const response = await post(REPORT, {
      'X-Request-Timestamp': timestamp,
      'X-Request-Signature': sign(timestamp, REPORT, 'another-token'),
    });
    expect(response.status).toBe(401);
  });

  it('rejects a signature over a different timestamp', async () => {
    const response = await post(REPORT, {
      'X-Request-Timestamp': String(NOW_SECONDS),
      'X-Request-Signature': sign(timestamp, REPORT),
    });
    expect(response.status).toBe(401);
  });

  it('emits otp.channel_failed for a signed expired report of a tracked request', async () => {
    const uid = 'bbbbbbbb-0000-7000-8000-000000000001';
    await track('8f7e2c61b0a94c13', uid);
    const response = await post(REPORT, {
      'X-Request-Timestamp': timestamp,
      'X-Request-Signature': sign(timestamp, REPORT),
    });
    expect(response.status).toBe(200);
    const rows = await channelFailedRows(uid);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toMatchObject({
      type: 'otp.channel_failed',
      data: { verification_id: 'verification-8f7e2c61b0a94c13' },
    });
  });

  it('acknowledges a delivered report without emitting anything', async () => {
    const uid = 'bbbbbbbb-0000-7000-8000-000000000002';
    await track('req-delivered', uid);
    const body = report('req-delivered', 'delivered');
    const response = await post(body, {
      'X-Request-Timestamp': timestamp,
      'X-Request-Signature': sign(timestamp, body),
    });
    expect(response.status).toBe(200);
    expect(await channelFailedRows(uid)).toHaveLength(0);
  });

  it('acknowledges but drops a stale report', async () => {
    const uid = 'bbbbbbbb-0000-7000-8000-000000000003';
    await track('req-stale', uid);
    const body = report('req-stale', 'expired');
    const stale = String(NOW_SECONDS - 3600);
    const response = await post(body, {
      'X-Request-Timestamp': stale,
      'X-Request-Signature': sign(stale, body),
    });
    expect(response.status).toBe(200);
    expect(await channelFailedRows(uid)).toHaveLength(0);
  });
});
