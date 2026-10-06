/**
 * `push.send` end to end against a migrated Postgres and wire-level APNs/FCM stand-ins replaying
 * recorded responses: sandbox tokens reach the sandbox host and production tokens the production
 * host under the build's topic with a valid provider JWT; 410 and BadDeviceToken retire the token;
 * 429/5xx hand the job back to pg-boss until the last attempt; FCM gets a data-only message and
 * UNREGISTERED retires the token; denied permission and expired notifications send nothing.
 */
import { randomUUID } from 'node:crypto';

import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import type { JobWithMetadata } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runAttempt } from '../src/boss';
import { pushSendJob, sendPush, type PushSendDeps } from '../src/jobs/push/send';
import { createMetricsRecorder } from '../src/obs/metrics';
import { createApnsProvider, createCopyRenderer, createFcmProvider } from '../src/push';
import {
  insertDevice,
  insertUser,
  silentLogger,
  startNotifyDb,
  type NotifyDb,
} from './notify-fixtures';
import { startFakeApns, startFakeFcm, type FakeApns, type FakeFcm } from './push-servers';

let db: NotifyDb;
let apnsServer: FakeApns;
let fcmServer: FakeFcm;
let deps: PushSendDeps;

beforeAll(async () => {
  [db, apnsServer, fcmServer] = await Promise.all([
    startNotifyDb(),
    startFakeApns(),
    startFakeFcm(),
  ]);
  deps = {
    apns: createApnsProvider({
      credentials: apnsServer.credentials,
      addresses: apnsServer.addresses,
      rejectUnauthorized: false,
    }),
    fcm: createFcmProvider({
      serviceAccount: fcmServer.serviceAccount,
      httpAgent: fcmServer.agent,
      credential: fcmServer.credential,
    }),
    renderer: createCopyRenderer(),
    defaultBundleId: 'app.critterpass.dev',
  };
}, 240_000);

afterAll(async () => {
  await deps?.apns?.shutdown();
  await deps?.fcm?.shutdown();
  await Promise.all([apnsServer?.close(), fcmServer?.close(), db?.stop()]);
});

interface Target {
  readonly uid: string;
  readonly deviceId: string;
  readonly notificationId: string;
}

async function target(options: {
  platform?: 'ios' | 'android';
  token: string;
  env?: 'sandbox' | 'prod';
  bundleId?: string;
  cls?: string;
  expiresAt?: Date;
  permission?: string;
}): Promise<Target> {
  const uid = await insertUser(db.pool);
  const { deviceId } = await insertDevice(db.pool, uid, {
    platform: options.platform ?? 'ios',
    token: options.token,
    env: options.env ?? 'prod',
  });
  await db.pool.query('UPDATE devices SET bundle_id = $2, permission_state = $3 WHERE id = $1', [
    deviceId,
    options.bundleId ?? null,
    JSON.stringify(options.permission ? { notif: options.permission } : {}),
  ]);
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO notifications (user_id, key, category, class, sender, template_id, title, body, ctx,
       collapse_key, dedupe_key, local_date, expires_at)
     VALUES ($1, 'vote_needs_you', 'cp.vote', $2, '{"kind":"guide","id":"tokek","name":"Tokek"}', 't',
       'Where to in March?', 'Your vote settles it.', '{"poll_id":"p1"}', 'vote:p1', $3, CURRENT_DATE, $4)
     RETURNING id`,
    [
      uid,
      options.cls ?? 'budgeted',
      randomUUID(),
      options.expiresAt ?? new Date(Date.now() + 3_600_000),
    ],
  );
  return { uid, deviceId, notificationId: rows[0]!.id };
}

const send = (t: Target, isFinal = false) =>
  sendPush(db.pool, deps, { notification_id: t.notificationId, device_id: t.deviceId }, isFinal);

async function state(t: Target) {
  const { rows } = await db.pool.query<{
    state: string;
    drop_reason: string | null;
    invalid_at: Date | null;
    invalid_reason: string | null;
  }>(
    `SELECT n.state, n.drop_reason, t.invalid_at, t.invalid_reason
     FROM notifications n, push_tokens t WHERE n.id = $1 AND t.device_id = $2`,
    [t.notificationId, t.deviceId],
  );
  return rows[0];
}

describe('APNs', () => {
  it('sends production tokens to the production host under the build topic', async () => {
    const t = await target({ token: `ok-${randomUUID()}`, bundleId: 'app.critterpass.staging' });
    expect(await send(t)).toEqual({ outcome: 'sent' });
    const request = apnsServer.requests.at(-1);
    expect(request).toMatchObject({
      server: 'prod',
      jwtValid: true,
      headers: {
        'apns-topic': 'app.critterpass.staging',
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-collapse-id': 'vote:p1',
      },
      body: {
        aps: { alert: { title: 'Where to in March?' }, category: 'cp.vote', 'mutable-content': 1 },
        cp: { v: 1, nid: t.notificationId, type: 'vote_needs_you', full: true },
      },
    });
    expect(await state(t)).toMatchObject({ state: 'sent', invalid_at: null });
  });

  it('sends sandbox tokens to the sandbox host', async () => {
    const t = await target({ token: `ok-${randomUUID()}`, env: 'sandbox' });
    await send(t);
    expect(apnsServer.requests.at(-1)).toMatchObject({
      server: 'sandbox',
      headers: { 'apns-topic': 'app.critterpass.dev' },
    });
  });

  it.each(['gone', 'bad'])('retires the token on a recorded %s response', async (kind) => {
    const t = await target({ token: `${kind}-${randomUUID()}` });
    const outcome = await send(t);
    expect(outcome.outcome).toBe('invalid_token');
    const after = await state(t);
    expect(after?.invalid_at).toBeInstanceOf(Date);
    expect(after).toMatchObject({
      state: 'failed',
      drop_reason: 'invalid_token',
      invalid_reason: kind === 'gone' ? 'Unregistered' : 'BadDeviceToken',
    });
  });

  it.each(['busy', 'down'])(
    'hands a %s response back for retry, then records the last failure',
    async (kind) => {
      const t = await target({ token: `${kind}-${randomUUID()}` });
      expect((await send(t)).outcome).toBe('retry');
      expect(await state(t)).toMatchObject({ state: 'queued', invalid_at: null });
      expect(await send(t, true)).toMatchObject({ outcome: 'failed' });
      expect(await state(t)).toMatchObject({ state: 'failed', invalid_at: null });
    },
  );

  it('fails the pg-boss attempt so the queue retries it', async () => {
    const t = await target({ token: `busy-${randomUUID()}` });
    const job = {
      id: randomUUID(),
      name: 'push.send',
      data: { notification_id: t.notificationId, device_id: t.deviceId },
      retryCount: 0,
      retryLimit: 5,
      signal: new AbortController().signal,
      output: null,
    } as unknown as JobWithMetadata<unknown>;
    const result = await runAttempt(
      pushSendJob(deps),
      job,
      { pool: db.pool, boss: undefined as never, logger: silentLogger },
      () => undefined,
    );
    expect(result.status).toBe('failed');
  });

  it('sends nothing when notifications are denied or the notification has expired', async () => {
    const denied = await target({ token: `ok-${randomUUID()}`, permission: 'denied' });
    expect(await send(denied)).toEqual({ outcome: 'skipped', reason: 'permission_denied' });
    const stale = await target({
      token: `ok-${randomUUID()}`,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await send(stale)).toEqual({ outcome: 'skipped', reason: 'expired' });
  });
});

describe('FCM', () => {
  it('sends a data-only message, high priority for ALWAYS', async () => {
    const t = await target({ platform: 'android', token: `ok-${randomUUID()}`, cls: 'always' });
    expect(await send(t)).toEqual({ outcome: 'sent' });
    const request = fcmServer.requests.at(-1);
    expect(request?.path).toBe('/v1/projects/critterpass-test/messages:send');
    expect(request?.authorization).toBe('Bearer ya29.recorded-test-token');
    expect(request?.body.message).toMatchObject({
      data: { v: '1', nid: t.notificationId, channel_id: 'cp_votes', title: 'Where to in March?' },
      android: { priority: 'high', collapse_key: 'vote:p1' },
    });
    expect(request?.body.message).not.toHaveProperty('notification');
  });

  it('retires an UNREGISTERED token and retries quota and server errors', async () => {
    const gone = await target({ platform: 'android', token: `gone-${randomUUID()}` });
    expect(await send(gone)).toMatchObject({ outcome: 'invalid_token' });
    expect((await state(gone))?.invalid_reason).toBe('messaging/registration-token-not-registered');
    for (const kind of ['busy', 'down']) {
      const t = await target({ platform: 'android', token: `${kind}-${randomUUID()}` });
      expect((await send(t)).outcome).toBe('retry');
    }
  });
});

describe('cp_push_total', () => {
  it('counts every attempt that reached a provider, by provider, category and outcome', async () => {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
    const meter = new MeterProvider({ readers: [reader] }).getMeter('test');
    const counted = { ...deps, metrics: createMetricsRecorder({ meter, strict: true }) };
    const attempt = (t: Target, isFinal = false) =>
      sendPush(
        db.pool,
        counted,
        { notification_id: t.notificationId, device_id: t.deviceId },
        isFinal,
      );

    await attempt(await target({ token: `ok-${randomUUID()}` }));
    await attempt(await target({ token: `ok-${randomUUID()}` }));
    await attempt(await target({ token: `gone-${randomUUID()}` }));
    const busy = await target({ token: `busy-${randomUUID()}` });
    await attempt(busy);
    await attempt(busy, true);
    await attempt(await target({ platform: 'android', token: `ok-${randomUUID()}` }));
    await attempt(await target({ token: `ok-${randomUUID()}`, permission: 'denied' }));

    await reader.forceFlush();
    const points = exporter
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics))
      .filter((metric) => metric.descriptor.name === 'cp_push_total')
      .flatMap((metric) =>
        metric.dataPoints.map((point) => ({ ...point.attributes, value: point.value })),
      );
    const vote = { category: 'cp.vote' };
    expect(points).toHaveLength(5);
    expect(points).toEqual(
      expect.arrayContaining([
        { ...vote, provider: 'apns', outcome: 'sent', value: 2 },
        { ...vote, provider: 'apns', outcome: 'invalid_token', value: 1 },
        { ...vote, provider: 'apns', outcome: 'retry', value: 1 },
        { ...vote, provider: 'apns', outcome: 'failed', value: 1 },
        { ...vote, provider: 'fcm', outcome: 'sent', value: 1 },
      ]),
    );
  });
});
