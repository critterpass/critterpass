/**
 * Jobs panel and replays over real Postgres, pg-boss and Redis: a job that failed every attempt
 * shows in the dead letters with its error and a redacted payload, a redrive of two selected ids
 * runs exactly those two once each under one audit row, a cron's last run is summarised, live
 * workers are counted from their heartbeats, and a stored webhook event is replayed and audited.
 */
import {
  WORKER_HEARTBEAT_KEY_PREFIX,
  WORKER_HEARTBEAT_SET,
  WORKER_HEARTBEAT_TTL_SECONDS,
} from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { jobsArea, jobsPanelSchema } from '../../src/admin/jobs';
import { defineWebhookReplay } from '../../src/admin/webhook-replay';
import { startJobProducer } from '../../src/jobs/producer';
import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

const QUEUE = 'probe.flaky';
const TRIP = '0199a0f2-7c1e-7d4b-9a53-2f3c1d0e9b11';

let harness: AdminHarness;
let boss: PgBoss;
let app: TestApp;
let ops: string;
const applied: string[] = [];

defineWebhookReplay<{ id: string; amount: number }>({
  provider: 'fixture_pay',
  load: (_tx, eventId) =>
    Promise.resolve(eventId === 'evt_1' ? { id: 'evt_1', amount: 1200 } : null),
  reapply: (_tx, event) => {
    if (!applied.includes(event.id)) applied.push(event.id);
    return Promise.resolve('already_applied');
  },
});

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  await harness.seedOperator('support@critterpass.test', ['support']);
  boss = await startJobProducer({
    connectionString: String(
      (harness.pool.options as { connectionString: string }).connectionString,
    ),
    logger: { error: () => undefined },
  });
  await boss.createQueue(`${QUEUE}.dlq`, { policy: 'standard', retryLimit: 0 });
  await boss.createQueue(QUEUE, {
    policy: 'standard',
    retryLimit: 2,
    retryDelay: 0,
    retryBackoff: false,
    deadLetter: `${QUEUE}.dlq`,
  });
  await boss.createQueue('probe.plain', { policy: 'standard' });
  app = harness.app({
    areas: [
      ...harness.areas(),
      jobsArea({ pool: harness.pool, boss: () => Promise.resolve(boss), redis: harness.redis }),
    ],
  });
  ops = await app.signIn('ops@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app.close();
  await boss.stop({ graceful: false });
  await harness.stop();
});

async function failEveryAttempt(data: object, singletonKey?: string): Promise<void> {
  await boss.send(QUEUE, data, singletonKey === undefined ? {} : { singletonKey });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [job] = await boss.fetch(QUEUE);
    if (job === undefined) throw new Error(`no job on attempt ${attempt + 1}`);
    await boss.fail(QUEUE, job.id, { message: `supplier returned 503 (attempt ${attempt + 1})` });
  }
}

async function panel() {
  const response = await app.request('/v1/admin/jobs', { headers: { cookie: ops } });
  expect(response.status).toBe(200);
  return jobsPanelSchema.parse(await response.json());
}

async function auditCount(action: string): Promise<number> {
  const { rows } = await harness.pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM ops.admin_audit WHERE action = $1',
    [action],
  );
  return rows[0]?.n ?? 0;
}

describe('jobs panel', () => {
  it('shows a job that failed three times with its error and a redacted payload', async () => {
    await failEveryAttempt({
      trip_id: TRIP,
      device_token: 'aaaaaaaaaaaaaaaaaaaawxyz',
      note: 'Please call me on the hotel phone',
    });
    const read = await panel();
    const letter = read.dead_letters.find((entry) => entry.queue === QUEUE);
    expect(letter).toMatchObject({
      attempts: 3,
      error: 'supplier returned 503 (attempt 3)',
      data: { trip_id: TRIP, device_token: '…wxyz', note: '[redacted]' },
    });
    expect(read.queues.find((queue) => queue.name === QUEUE)).toMatchObject({
      dead_letter: `${QUEUE}.dlq`,
      dead_letters: 1,
    });
    expect(read.queues.some((queue) => queue.name.endsWith('.dlq'))).toBe(false);
  });

  it('redrives two selected dead letters once each under one audit row', async () => {
    await failEveryAttempt({ trip_id: TRIP, n: 2 }, 'trip-2');
    await failEveryAttempt({ trip_id: TRIP, n: 3 }, 'trip-3');
    const letters = (await panel()).dead_letters.filter((entry) => entry.queue === QUEUE);
    expect(letters).toHaveLength(3);
    const chosen = letters.slice(0, 2).map((entry) => entry.id);

    const response = await app.command(ops, 'redrive_jobs', { queue: QUEUE, job_ids: chosen });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { moved: 2 } });
    expect(await auditCount('redrive_jobs')).toBe(1);

    const running = await boss.fetch(QUEUE, { batchSize: 10, includeMetadata: true });
    expect(running).toHaveLength(2);
    // pg-boss 12 keeps a redriven job's singleton key, so keyed queues still fold duplicates.
    expect(running.map((job) => job.singletonKey).sort()).toEqual(
      letters
        .slice(0, 2)
        .map((entry) =>
          (entry.data as { n?: number }).n === undefined
            ? null
            : `trip-${String((entry.data as { n: number }).n)}`,
        )
        .sort(),
    );
    for (const job of running) await boss.complete(QUEUE, job.id);
    expect(await boss.fetch(QUEUE)).toEqual([]);
    const left = (await panel()).dead_letters.filter((entry) => entry.queue === QUEUE);
    expect(left.map((entry) => entry.id)).toEqual(
      letters.filter((entry) => !chosen.includes(entry.id)).map((entry) => entry.id),
    );
  });

  it('refuses a redrive on a queue without a dead letter queue, and support entirely', async () => {
    const plain = await app.command(ops, 'redrive_jobs', { queue: 'probe.plain' });
    expect(plain.status).toBe(422);
    const support = await app.signIn('support@critterpass.test');
    expect((await app.command(support, 'redrive_jobs', { queue: QUEUE })).status).toBe(403);
  });

  it("summarises a cron's last run and counts live workers", async () => {
    await boss.createQueue('maint.purge', { policy: 'stately' });
    await boss.send('maint.purge', {});
    const [job] = await boss.fetch('maint.purge');
    if (job === undefined) throw new Error('no purge job');
    await boss.complete('maint.purge', job.id, { deleted: { rt_outbox: 3 }, batches: 2 });
    for (const instance of ['worker-a', 'worker-b', 'worker-gone']) {
      await harness.redis.sAdd(WORKER_HEARTBEAT_SET, instance);
    }
    for (const instance of ['worker-a', 'worker-b']) {
      await harness.redis.set(`${WORKER_HEARTBEAT_KEY_PREFIX}${instance}`, '{}', {
        EX: WORKER_HEARTBEAT_TTL_SECONDS,
      });
    }
    const read = await panel();
    expect(read.crons.find((cron) => cron.queue === 'maint.purge')).toMatchObject({
      expr: '30 3 * * *',
      last_state: 'completed',
      summary: 'batches: 2, deleted: {1}',
    });
    expect(read.workers).toBe(2);
    expect(await harness.redis.sMembers(WORKER_HEARTBEAT_SET)).not.toContain('worker-gone');
  });
});

describe('webhook replay', () => {
  it('re-applies a stored event through its provider and audits it', async () => {
    const response = await app.command(ops, 'replay_webhook', {
      provider: 'fixture_pay',
      event_id: 'evt_1',
    });
    expect(response.status).toBe(200);
    expect(applied).toEqual(['evt_1']);
    expect(await auditCount('replay_webhook')).toBe(1);
    const missing = await app.command(ops, 'replay_webhook', {
      provider: 'fixture_pay',
      event_id: 'evt_404',
    });
    expect(missing.status).toBe(404);
    const unknown = await app.command(ops, 'replay_webhook', {
      provider: 'nobody',
      event_id: 'evt_1',
    });
    expect(unknown.status).toBe(422);
  });
});
