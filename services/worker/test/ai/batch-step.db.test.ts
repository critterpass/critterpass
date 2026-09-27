/**
 * A batch step end to end on real pg-boss runtimes against recorded DeepSeek responses: requests
 * run as direct calls, each result is applied exactly once, a transient provider failure fails the
 * attempt and the retry calls only the requests that never finished, every call is billed to the
 * job and the job's totals equal its `ai_usage` rows. A redelivered job changes nothing.
 */
import { createGateway, recordUsage, startAgentJob, type BatchItemResult } from '@cp/ai';
import { fixtureTransport } from '@cp/ai/testing';
import { sendInTx, withSystem } from '@cp/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { batchStep } from '../../src/ai/batch-step';
import { defineAgentJob } from '../../src/ai/job-runner';
import { enqueue } from '../../src/boss';
import {
  fastSpec,
  startJobsHarness,
  uniqueQueue,
  until,
  type JobsHarness,
} from '../helpers/jobs-harness';
import { insertUser, jobRow, usageTotals } from './agent-job-fixtures';

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

const turn = (content: string) => ({ messages: [{ role: 'user' as const, content }] });
/** Off-peak, so the recorded calls have fixed prices. */
const OFF_PEAK = new Date('2026-09-28T05:00:00Z');

describe('batch step', () => {
  it('applies each result once and resumes after a transient failure without re-running finished requests', async () => {
    const queue = uniqueQueue('agent_batch');
    const transport = fixtureTransport([
      'flash-quest-mural',
      'invalid-request-422',
      'anthropic/overloaded-529',
      'anthropic/overloaded-529',
      'flash-quest-kopi',
    ]);
    const gateway = createGateway({
      apiKey: 'fixture-key',
      fetch: transport.fetch,
      maxAttempts: 2,
      sleep: () => Promise.resolve(),
      now: () => OFF_PEAK,
      onUsage: (record) => recordUsage((fn) => withSystem(harness.pool, fn), record),
    });
    const applied: [string, string][] = [];
    const generate = batchStep(
      {
        id: 'generate',
        route: 'quests.generate',
        build: () =>
          Promise.resolve([
            { customId: 'quest-1', input: turn('gecko mural') },
            { customId: 'quest-2', input: turn('bad request') },
            { customId: 'quest-3', input: turn('kopi') },
          ]),
        onResult: (_tx, result: BatchItemResult) => {
          applied.push([result.customId, result.type]);
          return Promise.resolve();
        },
      },
      { gateway, concurrency: 1 },
    );
    const job = defineAgentJob({
      kind: 'quests',
      queue,
      spec: fastSpec({ policy: 'exclusive', retryLimit: 2, retryDelay: 1 }),
      pollingIntervalSeconds: 0.5,
      steps: [
        generate,
        { id: 'finish', run: (ctx) => Promise.resolve({ from: ctx.results.generate }) },
      ],
    });
    const boss = await harness.startRuntime([job]);
    const uid = await insertUser(harness.pool);
    const input = { theme: 'old town' };
    const { id } = await withSystem(harness.pool, (tx) =>
      startAgentJob(tx, (q, data, options) => sendInTx(tx, q, data, options), {
        kind: 'quests',
        queue,
        userId: uid,
        tripId: null,
        input,
        stepIds: ['generate', 'finish'],
      }),
    );
    await until(async () => (await jobRow(harness.pool, id)).status === 'succeeded', 30_000);

    // Attempt 1: quest-1 succeeds, quest-2 is rejected for good, quest-3 hits 529 twice.
    // Attempt 2: only quest-3 is called.
    expect(
      transport.requests.map((r) => (r.messages as { content: string }[])[0]?.content),
    ).toEqual(['gecko mural', 'bad request', 'kopi', 'kopi', 'kopi']);
    expect(applied).toEqual([
      ['quest-1', 'succeeded'],
      ['quest-2', 'errored'],
      ['quest-3', 'succeeded'],
    ]);
    const row = await jobRow(harness.pool, id);
    expect(row.steps.map((s) => [s.step, s.status, s.attempts])).toEqual([
      ['generate', 'done', 2],
      ['finish', 'done', 1],
    ]);
    const summary = { requests: 3, succeeded: 2, refused: 0, errored: 1 };
    expect(row.partial).toEqual({ generate: summary, finish: { from: summary } });
    // 112 in + 94 out, and 110 in + 118 out, at the off-peak fast rate: 73 + 87 µ$.
    const usage = { rows: 2, tokens_in: 222, tokens_out: 212, cost_micros: 160 };
    expect(await usageTotals(harness.pool, id)).toEqual(usage);
    expect(row).toMatchObject({ tokens_in: 222, tokens_out: 212, cost_micros: 160 });
    expect(row.model).toBe('deepseek-flash');

    // A redelivered job finds it finished: nothing is called, applied or billed again.
    const again = await enqueue(boss, job, { agent_job_id: id, input });
    await until(async () => {
      const { rows } = await harness.pool.query<{ state: string }>(
        'SELECT state FROM pgboss.job WHERE name = $1 AND id = $2',
        [queue, again],
      );
      return rows[0]?.state === 'completed';
    }, 10_000);
    expect(transport.requests).toHaveLength(5);
    expect(applied).toHaveLength(3);
    expect(await usageTotals(harness.pool, id)).toEqual(usage);
  });
});
