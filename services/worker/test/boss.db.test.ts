/**
 * The pg-boss runtime against a real Postgres migrated with this repo's migrations: pg-boss runs as
 * app_system, enqueue-in-transaction is atomic with the caller's transaction, retries end in the
 * dead-letter queue and can be redriven, singleton keys dedupe, and stopping lets in-flight jobs
 * finish or hands them back to the queue.
 */
import { randomUUID } from 'node:crypto';

import { withSystem, withUser } from '@cp/db';
import type { PgBoss } from 'pg-boss';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  defineJob,
  dlqName,
  enqueue,
  enqueueInTx,
  ensureQueues,
  listDeadLetters,
  redrive,
  type AnyJobDefinition,
  type DeadLetterAlert,
} from '../src/boss';
import {
  fastSpec,
  startJobsHarness,
  uniqueQueue,
  until,
  type JobsHarness,
} from './helpers/jobs-harness';

let harness: JobsHarness;
let pool: JobsHarness['pool'];

beforeAll(async () => {
  harness = await startJobsHarness();
  pool = harness.pool;
}, 240_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness.close();
});

function startRuntime(
  jobs: readonly AnyJobDefinition[],
  alerts: DeadLetterAlert[] = [],
): Promise<PgBoss> {
  return harness.startRuntime(jobs, { alerts });
}

async function jobState(queue: string, id: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ state: string }>(
    'SELECT state::text AS state FROM pgboss.job WHERE name = $1 AND id = $2',
    [queue, id],
  );
  return rows[0]?.state;
}

const payload = z.object({ n: z.number().int() });

describe('pg-boss runtime', () => {
  it('installs pg-boss into the pgboss schema owned by app_system', async () => {
    await startRuntime([]);
    const { rows } = await pool.query<{ owner: string }>(
      `SELECT DISTINCT pg_get_userbyid(c.relowner) AS owner
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pgboss' AND c.relkind IN ('r', 'p')`,
    );
    expect(rows.map((row) => row.owner)).toEqual(['app_system']);
  });

  it('drops a job enqueued in a transaction that rolls back, and runs a committed one', async () => {
    const queue = uniqueQueue('tx');
    const seen: number[] = [];
    const job = defineJob({
      queue,
      spec: fastSpec(),
      schema: payload,
      pollingIntervalSeconds: 0.5,
      handler: ({ n }) => {
        seen.push(n);
        return Promise.resolve();
      },
    });
    await startRuntime([job]);

    await expect(
      withSystem(pool, async (tx) => {
        await enqueueInTx(tx, job, { n: 1 });
        throw new Error('command failed after enqueue');
      }),
    ).rejects.toThrow('command failed after enqueue');

    const uid = randomUUID();
    const roleAfter = await withUser(pool, uid, 'device-1', async (tx) => {
      await enqueueInTx(tx, job, { n: 2 });
      const { rows } = await tx.query<{ role: string }>('SELECT current_user::text AS role');
      return rows[0]?.role;
    });
    expect(roleAfter).toBe('app_user');

    await until(() => seen.length > 0, 10_000);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(seen).toEqual([2]);
    const { rows } = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM pgboss.job WHERE name = $1',
      [queue],
    );
    expect(rows[0]?.count).toBe(1);
  });

  it('retries, dead-letters with one alert, and redrives into a fresh run', async () => {
    const queue = uniqueQueue('dlq');
    let failing = true;
    const attempts: number[] = [];
    const alerts: DeadLetterAlert[] = [];
    const job = defineJob({
      queue,
      spec: fastSpec({ retryLimit: 2, deadLetter: true }),
      schema: payload,
      pollingIntervalSeconds: 0.5,
      handler: ({ n }, { job: attempt }) => {
        attempts.push(attempt.retryCount);
        if (failing) return Promise.reject(new Error(`boom ${n}`));
        return Promise.resolve({ ok: true });
      },
    });
    const boss = await startRuntime([job], alerts);
    const id = await enqueue(boss, job, { n: 7 });
    expect(id).not.toBeNull();

    await until(async () => (await listDeadLetters(boss, queue)).length === 1, 15_000);
    expect(attempts).toEqual([0, 1, 2]);
    expect(await jobState(queue, id ?? '')).toBe('failed');
    expect(alerts).toEqual([{ queue, jobId: id, attempts: 3, message: 'boom 7' }]);
    const [dead] = await listDeadLetters(boss, queue);
    expect(dead?.data).toEqual({ n: 7 });

    failing = false;
    expect(await redrive(boss, queue)).toBe(1);
    const completed = async () => {
      const { rows } = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM pgboss.job WHERE name = $1 AND state = 'completed'",
        [queue],
      );
      return rows[0]?.count ?? 0;
    };
    // The handler returning is not the job being settled: pg-boss marks it completed a moment
    // later, so wait for the settled state rather than for the handler call.
    await until(async () => attempts.length === 4 && (await completed()) > 0, 10_000);
    expect(attempts[3]).toBe(0);
    expect(await listDeadLetters(boss, queue)).toEqual([]);
    expect(await completed()).toBe(1);
    expect(await boss.getQueue(dlqName(queue))).not.toBeNull();
  });

  it('dead-letters a payload the schema rejects without running the handler', async () => {
    const queue = uniqueQueue('invalid');
    let ran = false;
    const alerts: DeadLetterAlert[] = [];
    const job = defineJob({
      queue,
      spec: fastSpec({ retryLimit: 3, deadLetter: true }),
      schema: payload,
      pollingIntervalSeconds: 0.5,
      handler: () => {
        ran = true;
        return Promise.resolve();
      },
    });
    const boss = await startRuntime([job], alerts);
    await boss.send(queue, { n: 'not a number' });
    await until(async () => (await listDeadLetters(boss, queue)).length === 1, 10_000);
    expect(ran).toBe(false);
    expect(alerts).toHaveLength(1);
  });

  it('folds sends with the same singleton key into one queued job', async () => {
    const queue = uniqueQueue('singleton');
    const handler = () => Promise.resolve();
    const job = defineJob({
      queue,
      spec: fastSpec({ policy: 'exclusive' }),
      schema: payload,
      singletonKey: ({ n }) => `n:${n}`,
      handler,
    });
    // Nothing consumes the queue, so every send below meets the first job still queued.
    const boss = await startRuntime([]);
    await ensureQueues(boss, [[queue, job.spec]]);

    const first = await enqueue(boss, job, { n: 1 });
    const second = await enqueue(boss, job, { n: 1 });
    const third = await withSystem(pool, (tx) => enqueueInTx(tx, job, { n: 1 }));
    const other = await enqueue(boss, job, { n: 2 });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(third).toBeNull();
    expect(other).not.toBeNull();
    expect(() =>
      defineJob({ queue, spec: fastSpec(), schema: payload, singletonKey: () => 'k', handler }),
    ).toThrow('standard policy ignores it');
  });

  it('lets an in-flight job finish on stop, and hands back one that outlives the timeout', async () => {
    const queue = uniqueQueue('stop');
    const started: number[] = [];
    const finished: number[] = [];
    const job = defineJob({
      queue,
      spec: fastSpec(),
      schema: payload,
      pollingIntervalSeconds: 0.5,
      handler: async ({ n }) => {
        started.push(n);
        await new Promise((resolve) => setTimeout(resolve, n));
        finished.push(n);
      },
    });

    const quick = await startRuntime([job]);
    const quickId = await enqueue(quick, job, { n: 1500 });
    await until(() => started.includes(1500), 10_000);
    await harness.stopRuntime(quick, 10_000);
    expect(finished).toContain(1500);
    expect(await jobState(queue, quickId ?? '')).toBe('completed');

    const slow = await startRuntime([job]);
    const slowId = await enqueue(slow, job, { n: 20_000 });
    await until(() => started.includes(20_000), 10_000);
    await harness.stopRuntime(slow, 300);
    expect(['retry', 'created']).toContain(await jobState(queue, slowId ?? ''));
  }, 60_000);
});
