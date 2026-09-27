/**
 * A batch step end to end on a real pg-boss runtime against recorded Message Batches responses:
 * submit once, poll until the batch ends, apply the results exactly once (usage billed to the job
 * at batch prices, results mapped by custom_id), then resume the job's remaining steps.
 */
import { createBatchClient, startAgentJob, type BatchItemResult } from '@cp/ai';
import { fixtureTransport } from '@cp/ai/testing';
import { sendInTx, withSystem } from '@cp/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AI_BATCH_POLL_QUEUE, aiBatchPollJob, batchStep } from '../../src/ai/batch-poll';
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

const BATCH_ID = 'msgbatch_01FixtureQuestsBatch0001';
const turn = (content: string) => ({ messages: [{ role: 'user' as const, content }] });

describe('ai.batch.poll', () => {
  it('submits once, polls until ended, applies results once and resumes the job', async () => {
    const queue = uniqueQueue('agent_batch');
    const transport = fixtureTransport([
      'batch-create',
      'batch-in-progress',
      'batch-ended',
      'batch-ended',
      'batch-results',
    ]);
    const batches = createBatchClient({ apiKey: 'fixture-key', fetch: transport.fetch });
    const delivered: [string, string][] = [];
    const generate = batchStep(
      {
        id: 'generate',
        route: 'quests.generate',
        build: () =>
          Promise.resolve([
            { customId: 'quest-1', input: turn('gecko mural') },
            { customId: 'quest-2', input: turn('kopi') },
            { customId: 'quest-3', input: turn('night market') },
          ]),
        onResults: (_tx, results: readonly BatchItemResult[]) => {
          delivered.push(...results.map((r): [string, string] => [r.customId, r.type]));
          return Promise.resolve({
            succeeded: results.filter((r) => r.type === 'succeeded').length,
          });
        },
      },
      { batches, pollDelaySeconds: 0 },
    );
    const job = defineAgentJob({
      kind: 'quests',
      queue,
      spec: fastSpec({ policy: 'exclusive' }),
      pollingIntervalSeconds: 0.5,
      steps: [
        generate,
        { id: 'finish', run: (ctx) => Promise.resolve({ from: ctx.results.generate }) },
      ],
    });
    const poll = aiBatchPollJob({
      batches,
      jobs: [job],
      pollDelaySeconds: 0,
      spec: fastSpec({ policy: 'stately' }),
    });
    const boss = await harness.startRuntime([job, { ...poll, pollingIntervalSeconds: 0.5 }]);
    const uid = await insertUser(harness.pool);
    const { id } = await withSystem(harness.pool, (tx) =>
      startAgentJob(tx, (q, data, options) => sendInTx(tx, q, data, options), {
        kind: 'quests',
        queue,
        userId: uid,
        tripId: null,
        input: { theme: 'old town' },
        stepIds: ['generate', 'finish'],
      }),
    );
    await until(async () => (await jobRow(harness.pool, id)).status === 'succeeded', 30_000);

    expect(transport.methods).toEqual(['POST', 'GET', 'GET', 'GET', 'GET']);
    expect([...delivered].sort()).toEqual([
      ['quest-1', 'succeeded'],
      ['quest-2', 'succeeded'],
      ['quest-3', 'errored'],
    ]);
    const row = await jobRow(harness.pool, id);
    expect(row.partial).toEqual({ generate: { succeeded: 2 }, finish: { from: { succeeded: 2 } } });
    expect(await usageTotals(harness.pool, id)).toEqual({
      rows: 2,
      tokens_in: 10_200,
      tokens_out: 500,
      cost_micros: 2750,
    });
    expect(row).toMatchObject({ tokens_in: 10_200, tokens_out: 500, cost_micros: 2750 });

    // A redelivered poll of the ended batch changes nothing and calls nothing.
    const again = await enqueue(boss, poll, {
      agent_job_id: id,
      step: 'generate',
      batch_id: BATCH_ID,
      route: 'quests.generate',
      resume: { queue, data: { agent_job_id: id, input: { theme: 'old town' } } },
    });
    await until(async () => {
      const { rows } = await harness.pool.query<{ state: string }>(
        'SELECT state FROM pgboss.job WHERE name = $1 AND id = $2',
        [AI_BATCH_POLL_QUEUE, again],
      );
      return rows[0]?.state === 'completed';
    }, 10_000);
    expect(transport.requests).toHaveLength(5);
    expect((await usageTotals(harness.pool, id))?.rows).toBe(2);
  });
});
