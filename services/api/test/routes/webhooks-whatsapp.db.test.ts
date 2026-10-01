/**
 * Signed webhook `failed` status marks the delivery and emits `otp.channel_failed` on `user:#uid`;
 * unsigned/bad-signature webhook -> 401.
 */
import { createHmac } from 'node:crypto';

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
import { registerWhatsAppWebhookRoutes } from '../../src/routes/webhooks-whatsapp';

const APP_SECRET = 'test-whatsapp-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

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
  registerWhatsAppWebhookRoutes(app, {
    appPool: pool,
    redis,
    appSecret: APP_SECRET,
    verifyToken: VERIFY_TOKEN,
  });
}, 180_000);

afterAll(async () => {
  await pool?.end();
  redis?.destroy();
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

function sign(body: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`;
}

function statusPayload(messageId: string, status: string): string {
  return JSON.stringify({
    entry: [{ changes: [{ value: { statuses: [{ id: messageId, status }] } }] }],
  });
}

async function rtOutboxRowsFor(channel: string) {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ payload: unknown }>('SELECT payload FROM rt_outbox WHERE channel = $1', [channel]),
  );
  return rows;
}

describe('GET /webhooks/whatsapp (verify-token handshake)', () => {
  it('echoes the challenge when the verify token matches', async () => {
    const response = await app.request(
      `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=echo-me`,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('echo-me');
  });

  it('rejects a wrong verify token', async () => {
    const response = await app.request(
      '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=echo-me',
    );
    expect(response.status).toBe(403);
  });
});

describe('POST /webhooks/whatsapp (signed status callback)', () => {
  it('rejects a request with no signature', async () => {
    const body = statusPayload('wamid.1', 'failed');
    const response = await app.request('/webhooks/whatsapp', { method: 'POST', body });
    expect(response.status).toBe(401);
  });

  it('rejects a request with a bad signature', async () => {
    const body = statusPayload('wamid.2', 'failed');
    const response = await app.request('/webhooks/whatsapp', {
      method: 'POST',
      body,
      headers: { 'X-Hub-Signature-256': 'sha256=deadbeef' },
    });
    expect(response.status).toBe(401);
  });

  it('marks a failed delivery and emits otp.channel_failed on user:#uid for a tracked message', async () => {
    const uid = 'aaaaaaaa-0000-7000-8000-000000000001';
    const tracker = createRedisOtpDeliveryTracker(redis);
    await tracker.recordDelivery({
      providerMessageId: 'wamid.tracked',
      channel: 'whatsapp',
      uid,
      verificationId: 'verification-1',
      phoneE164: '+6598765432',
    });

    const body = statusPayload('wamid.tracked', 'failed');
    const response = await app.request('/webhooks/whatsapp', {
      method: 'POST',
      body,
      headers: { 'X-Hub-Signature-256': sign(body) },
    });
    expect(response.status).toBe(200);

    const rows = await rtOutboxRowsFor(`user:#${uid}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toMatchObject({
      type: 'otp.channel_failed',
      data: { verification_id: 'verification-1' },
    });
  });

  it('does nothing (but still answers 200) for an untracked message id', async () => {
    const body = statusPayload('wamid.never-tracked', 'failed');
    const response = await app.request('/webhooks/whatsapp', {
      method: 'POST',
      body,
      headers: { 'X-Hub-Signature-256': sign(body) },
    });
    expect(response.status).toBe(200);
  });

  it('ignores a non-failure status (sent/delivered/read)', async () => {
    const uid = 'aaaaaaaa-0000-7000-8000-000000000002';
    const tracker = createRedisOtpDeliveryTracker(redis);
    await tracker.recordDelivery({
      providerMessageId: 'wamid.delivered',
      channel: 'whatsapp',
      uid,
      verificationId: 'verification-2',
      phoneE164: '+6598765433',
    });
    const body = statusPayload('wamid.delivered', 'delivered');
    const response = await app.request('/webhooks/whatsapp', {
      method: 'POST',
      body,
      headers: { 'X-Hub-Signature-256': sign(body) },
    });
    expect(response.status).toBe(200);
    expect(await rtOutboxRowsFor(`user:#${uid}`)).toHaveLength(0);
  });
});
