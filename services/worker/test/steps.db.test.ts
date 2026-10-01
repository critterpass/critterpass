/**
 * `runSteps` under a real pg-boss runtime: a retry resumes at the step that failed, the last failed
 * attempt compensates finished steps in reverse, `job.progress` rows land in `rt_outbox` in step
 * order, and a completed run appends its `notifyOnComplete` domain event.
 */
import { randomUUID } from 'node:crypto';

import { userChannel } from '@cp/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineJob, enqueue, runSteps, type Step } from '../src/boss';
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

const payload = z.object({ uid: z.uuid() });

async function progressRows(channel: string) {
  const { rows } = await harness.pool.query<{ step: string; pct: number; job_id: string }>(
    `SELECT payload->'data'->>'step' AS step, (payload->'data'->>'pct')::int AS pct,
            payload->'data'->>'job_id' AS job_id
     FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'job.progress' ORDER BY id`,
    [channel],
  );
  return rows;
}

describe('runSteps', () => {
  it('resumes a retried job at the step that failed and reports progress in order', async () => {
    const queue = uniqueQueue('resume');
    const runs: string[] = [];
    let failThird = true;
    const steps: Step[] = [
      { id: 'load', run: () => (runs.push('load'), Promise.resolve({ rows: 2 })) },
      { id: 'draft', run: () => (runs.push('draft'), Promise.resolve('draft-1')) },
      {
        id: 'persist',
        run: ({ results }) => {
          runs.push('persist');
          if (failThird) {
            failThird = false;
            return Promise.reject(new Error('database busy'));
          }
          return Promise.resolve({ saved: results.draft });
        },
      },
    ];
    const job = defineJob({
      queue,
      spec: fastSpec({ retryLimit: 2 }),
      schema: payload,
      pollingIntervalSeconds: 0.5,
      handler: ({ uid }, ctx) =>
        runSteps(ctx, steps, {
          userId: uid,
          notifyOnComplete: () => ({
            type: 'auth.merged',
            aggregateKind: 'user',
            aggregateId: uid,
            actorKind: 'system',
            actorId: null,
            payload: { from_uid: randomUUID(), into_uid: uid },
          }),
        }),
    });
    const boss = await harness.startRuntime([job]);
    const uid = randomUUID();
    const id = await enqueue(boss, job, { uid });

    await until(async () => {
      const [found] = await boss.findJobs(queue, { id: id ?? '' });
      return found?.state === 'completed';
    }, 15_000);

    expect(runs).toEqual(['load', 'draft', 'persist', 'persist']);
    const [done] = await boss.findJobs(queue, { id: id ?? '' });
    expect(done?.output).toEqual({
      steps: {
        load: { result: { rows: 2 } },
        draft: { result: 'draft-1' },
        persist: { result: { saved: 'draft-1' } },
      },
    });
    expect(await progressRows(userChannel(uid))).toEqual([
      { step: 'load', pct: 33, job_id: id },
      { step: 'draft', pct: 66, job_id: id },
      { step: 'persist', pct: 100, job_id: id },
    ]);
    const { rows } = await harness.pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM domain_events WHERE type = 'auth.merged' AND aggregate_id = $1",
      [uid],
    );
    expect(rows[0]?.count).toBe(1);
  });

  it('compensates finished steps in reverse when the last attempt fails', async () => {
    const queue = uniqueQueue('compensate');
    const log: string[] = [];
    const channel = `trip_draft:${randomUUID()}`;
    const steps: Step[] = [
      {
        id: 'reserve_quota',
        run: () => (log.push('run:reserve_quota'), Promise.resolve({ units: 1 })),
        compensate: (result) => (
          log.push(`undo:reserve_quota:${JSON.stringify(result)}`),
          Promise.resolve()
        ),
      },
      {
        id: 'hold_room',
        run: () => (log.push('run:hold_room'), Promise.resolve('hold-9')),
        compensate: (result) => (log.push(`undo:hold_room:${String(result)}`), Promise.resolve()),
      },
      {
        id: 'confirm',
        run: () => (log.push('run:confirm'), Promise.reject(new Error('supplier down'))),
        compensate: () => (log.push('undo:confirm'), Promise.resolve()),
      },
    ];
    const job = defineJob({
      queue,
      spec: fastSpec({ retryLimit: 1 }),
      schema: payload,
      pollingIntervalSeconds: 0.5,
      handler: (_data, ctx) => runSteps(ctx, steps, { progressChannel: channel }),
    });
    const boss = await harness.startRuntime([job]);
    const id = await enqueue(boss, job, { uid: randomUUID() });

    await until(async () => {
      const [found] = await boss.findJobs(queue, { id: id ?? '' });
      return found?.state === 'failed';
    }, 15_000);

    expect(log).toEqual([
      'run:reserve_quota',
      'run:hold_room',
      'run:confirm',
      'run:confirm',
      'undo:hold_room:hold-9',
      'undo:reserve_quota:{"units":1}',
    ]);
    const [failed] = await boss.findJobs(queue, { id: id ?? '' });
    expect(failed?.output).toMatchObject({
      failed_step: 'confirm',
      compensated: ['hold_room', 'reserve_quota'],
      compensationErrors: {},
    });
    expect((await progressRows(channel)).map((row) => row.step)).toEqual([
      'reserve_quota',
      'hold_room',
    ]);
  });
});
