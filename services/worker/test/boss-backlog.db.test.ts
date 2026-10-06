/**
 * A queue with a backlog drains back to back: pg-boss would otherwise wait out its poll interval
 * after every job, so N ready jobs took N intervals. Each case sends the whole backlog in one insert
 * (at most one NOTIFY), so only the worker's own wake-up can pull the jobs after the first.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineJob, type QueueSpec } from '../src/boss';
import {
  fastSpec,
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
  await harness?.close();
});

const payload = z.object({ n: z.number().int() });

interface Drain {
  readonly elapsedMs: number;
  readonly maxInFlight: number;
  readonly seen: readonly number[];
}

async function drainBacklog(options: {
  readonly spec: QueueSpec;
  readonly jobs: number;
  readonly concurrency: number;
  readonly pollingIntervalSeconds?: number;
  readonly budgetMs: number;
}): Promise<Drain> {
  const queue = uniqueQueue('backlog');
  const seen: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const job = defineJob({
    queue,
    spec: options.spec,
    schema: payload,
    concurrency: options.concurrency,
    ...(options.pollingIntervalSeconds === undefined
      ? {}
      : { pollingIntervalSeconds: options.pollingIntervalSeconds }),
    handler: async ({ n }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      seen.push(n);
      inFlight -= 1;
    },
  });
  const boss = await harness.startRuntime([job]);
  // Let every worker finish its first (empty) fetch and settle into its idle wait.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const started = Date.now();
  await boss.insert(
    queue,
    Array.from({ length: options.jobs }, (_, n) => ({ data: { n } })),
  );
  await until(() => seen.length === options.jobs, options.budgetMs);
  return { elapsedMs: Date.now() - started, maxInFlight, seen };
}

describe('draining a backlog', { timeout: 60_000 }, () => {
  it('runs ready jobs back to back instead of one per poll interval', async () => {
    const jobs = 12;
    const pollingIntervalSeconds = 1;
    const { elapsedMs, seen } = await drainBacklog({
      spec: fastSpec(),
      jobs,
      concurrency: 1,
      pollingIntervalSeconds,
      budgetMs: 8_000,
    });
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: jobs }, (_, n) => n));
    // One job per interval would take at least (jobs - 1) × 1 s = 11 s.
    expect(elapsedMs).toBeLessThan(((jobs - 1) * pollingIntervalSeconds * 1000) / 2);
  });

  it('drains a notify-enabled queue without waiting out its idle poll', async () => {
    // Unset, the idle wait is the 30 s backstop once the queue's notify flag is cached, 2 s before.
    const { elapsedMs, seen } = await drainBacklog({
      spec: fastSpec({ notify: true }),
      jobs: 8,
      concurrency: 1,
      budgetMs: 20_000,
    });
    expect(seen).toHaveLength(8);
    // One job per wait would take at least 7 × 2 s = 14 s.
    expect(elapsedMs).toBeLessThan(6_000);
  });

  it('keeps the queue concurrency while draining', async () => {
    const { maxInFlight, seen } = await drainBacklog({
      spec: fastSpec(),
      jobs: 16,
      concurrency: 2,
      pollingIntervalSeconds: 1,
      budgetMs: 5_000,
    });
    expect(seen).toHaveLength(16);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
