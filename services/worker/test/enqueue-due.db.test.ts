/**
 * `sched.enqueue_due` against real Postgres and pg-boss: due timers become jobs on their queue
 * exactly once even with two workers racing, future and cancelled timers stay put, a timer for a
 * queue that does not exist is marked failed, and the fired job carries the timer payload.
 */
import { randomUUID } from 'node:crypto';

import { scheduledJobDataSchema, scheduleEvent, withSystem, type ScheduledJobData } from '@cp/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { defineJob, enqueue, ensureQueues } from '../src/boss';
import { enqueueDue, enqueueDueJob } from '../src/jobs/sched/enqueue-due';
import {
  fastSpec,
  silent,
  startJobsHarness,
  uniqueQueue,
  until,
  type JobsHarness,
} from './helpers/jobs-harness';

let harness: JobsHarness;

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness.close();
});

const past = () => new Date(Date.now() - 60_000);

describe('sched.enqueue_due', () => {
  it('fires each due timer once under two concurrent workers', async () => {
    const queue = uniqueQueue('timer');
    const bossA = await harness.startRuntime([]);
    const bossB = await harness.startRuntime([]);
    await ensureQueues(bossA, [[queue, fastSpec()]]);

    const { dueIds, futureRef, cancelledRef } = await withSystem(harness.pool, async (tx) => {
      const ids: string[] = [];
      for (let i = 0; i < 300; i += 1) {
        ids.push(
          await scheduleEvent(tx, { kind: queue, refId: randomUUID(), at: past(), tz: 'UTC' }),
        );
      }
      const future = randomUUID();
      await scheduleEvent(tx, {
        kind: queue,
        refId: future,
        at: new Date(Date.now() + 3_600_000),
        tz: 'Europe/Berlin',
      });
      const cancelled = randomUUID();
      await scheduleEvent(tx, { kind: queue, refId: cancelled, at: past(), tz: 'UTC' });
      await tx.query(`UPDATE scheduled_events SET status = 'cancelled' WHERE ref_id = $1`, [
        cancelled,
      ]);
      await scheduleEvent(tx, {
        kind: 'missing.queue',
        refId: randomUUID(),
        at: past(),
        tz: 'UTC',
      });
      return { dueIds: ids, futureRef: future, cancelledRef: cancelled };
    });

    const [a, b] = await Promise.all([
      enqueueDue(harness.pool, bossA, silent, 40),
      enqueueDue(harness.pool, bossB, silent, 40),
    ]);
    expect(a.fired + b.fired).toBe(300);
    expect(a.failed + b.failed).toBe(1);
    expect(a.fired).toBeGreaterThan(0);
    expect(b.fired).toBeGreaterThan(0);

    const jobs = await harness.pool.query<{ timer: string; id: string }>(
      `SELECT data->>'scheduled_event_id' AS timer, id::text AS id FROM pgboss.job WHERE name = $1`,
      [queue],
    );
    expect(jobs.rows).toHaveLength(300);
    expect(new Set(jobs.rows.map((row) => row.timer))).toEqual(new Set(dueIds));

    const timers = await harness.pool.query<{ status: string; count: number }>(
      `SELECT status, count(*)::int AS count FROM scheduled_events
       WHERE kind IN ($1, 'missing.queue') GROUP BY status ORDER BY status`,
      [queue],
    );
    expect(timers.rows).toEqual([
      { status: 'cancelled', count: 1 },
      { status: 'enqueued', count: 300 },
      { status: 'failed', count: 1 },
      { status: 'pending', count: 1 },
    ]);
    const linked = await harness.pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM scheduled_events s
       JOIN pgboss.job j ON j.id = s.pgboss_job_id AND j.name = s.kind
       WHERE s.kind = $1 AND s.fired_at IS NOT NULL`,
      [queue],
    );
    expect(linked.rows[0]?.count).toBe(300);
    const untouched = await harness.pool.query<{ ref_id: string; status: string }>(
      `SELECT ref_id::text AS ref_id, status FROM scheduled_events WHERE ref_id = ANY($1::uuid[])
       ORDER BY status`,
      [[futureRef, cancelledRef]],
    );
    expect(untouched.rows).toEqual([
      { ref_id: cancelledRef, status: 'cancelled' },
      { ref_id: futureRef, status: 'pending' },
    ]);

    const again = await enqueueDue(harness.pool, bossA, silent, 40);
    expect(again).toEqual({ fired: 0, failed: 0 });
  }, 60_000);

  it('runs as the sched.enqueue_due job and hands the target handler the timer payload', async () => {
    const queue = uniqueQueue('target');
    const received: ScheduledJobData[] = [];
    const target = defineJob({
      queue,
      spec: fastSpec(),
      schema: scheduledJobDataSchema,
      pollingIntervalSeconds: 0.5,
      handler: (data) => {
        received.push(data);
        return Promise.resolve();
      },
    });
    const sweeper = enqueueDueJob();
    const boss = await harness.startRuntime([sweeper, target]);
    const refId = randomUUID();
    const at = past();
    const timerId = await withSystem(harness.pool, (tx) =>
      scheduleEvent(tx, { kind: queue, refId, slot: 'reminder', at, tz: 'UTC', data: { n: 1 } }),
    );

    await enqueue(boss, sweeper, null);
    await until(() => received.length === 1, 15_000);
    expect(received[0]).toEqual({
      scheduled_event_id: timerId,
      ref_id: refId,
      slot: 'reminder',
      due_at: at.toISOString(),
      data: { n: 1 },
    });
  });
});
