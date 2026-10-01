/**
 * Agent jobs under real pg-boss runtimes: a retried job resumes at its first unfinished step on a
 * fresh worker without repeating earlier side effects; its cost totals equal its `ai_usage` rows;
 * equal-input starts are idempotent and a changed input cancels the running job; a final failure
 * compensates finished steps.
 */
import { randomUUID } from 'node:crypto';

import { createGateway, recordUsage, startAgentJob, type StartAgentJobInput } from '@cp/ai';
import { fixtureTransport } from '@cp/ai/testing';
import { sendInTx, withSystem } from '@cp/db';
import { userChannel } from '@cp/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { defineAgentJob } from '../../src/ai/job-runner';
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
  await harness?.close();
});

function start(job: Omit<StartAgentJobInput, 'kind' | 'tripId'>) {
  return withSystem(harness.pool, (tx) =>
    startAgentJob(tx, (queue, data, options) => sendInTx(tx, queue, data, options), {
      kind: 'quests',
      tripId: null,
      ...job,
    }),
  );
}

const keyed = (overrides = {}) =>
  fastSpec({ policy: 'exclusive', retryLimit: 2, retryDelay: 3, ...overrides });

describe('agent job runner', () => {
  it('resumes on a restarted worker at the failed step, billing every model call to the job', async () => {
    const queue = uniqueQueue('agent_resume');
    const transport = fixtureTransport(['flash-basic']);
    const gateway = createGateway({
      apiKey: 'fixture-key',
      fetch: transport.fetch,
      // Off-peak, so the recorded call has a fixed price.
      now: () => new Date('2026-09-28T05:00:00Z'),
      onUsage: (record) => recordUsage((fn) => withSystem(harness.pool, fn), record),
    });
    const sideEffects: string[] = [];
    let failPersist = true;
    const job = defineAgentJob({
      kind: 'quests',
      queue,
      spec: keyed(),
      pollingIntervalSeconds: 0.5,
      steps: [
        {
          id: 'draft',
          run: async (ctx) => {
            sideEffects.push(ctx.idempotencyKey);
            const turn = { messages: [{ role: 'user' as const, content: 'three quests' }] };
            const result = await gateway.callModel('quests.generate', turn, ctx.usage);
            return { stop: result.message.stop_reason };
          },
        },
        {
          id: 'persist',
          run: (ctx) => {
            if (failPersist) {
              failPersist = false;
              return Promise.reject(new Error('database busy'));
            }
            return Promise.resolve({ saved: ctx.results.draft });
          },
        },
      ],
    });
    const uid = await insertUser(harness.pool);
    const first = await harness.startRuntime([job]);
    const { id } = await start({
      queue,
      userId: uid,
      input: { n: 3 },
      stepIds: ['draft', 'persist'],
    });
    await until(async () => (await jobRow(harness.pool, id)).steps[1]?.status === 'failed', 20_000);
    await harness.stopRuntime(first);

    await harness.startRuntime([job]);
    await until(async () => (await jobRow(harness.pool, id)).status === 'succeeded', 30_000);

    expect(sideEffects).toEqual([`${id}:draft`]);
    expect(transport.requests).toHaveLength(1);
    const row = await jobRow(harness.pool, id);
    expect(row.steps.map((s) => [s.step, s.status, s.attempts])).toEqual([
      ['draft', 'done', 1],
      ['persist', 'done', 2],
    ]);
    expect(row.partial).toEqual({
      draft: { stop: 'end_turn' },
      persist: { saved: { stop: 'end_turn' } },
    });
    const usage = await usageTotals(harness.pool, id);
    expect(usage).toEqual({ rows: 1, tokens_in: 10, tokens_out: 2, cost_micros: 3 });
    expect(row).toMatchObject({ tokens_in: 10, tokens_out: 2, cost_micros: 3 });
    expect(row.model).toBe('deepseek-flash');

    const { rows: progress } = await harness.pool.query<{ step: string; pct: number }>(
      `SELECT payload->'data'->>'step' AS step, (payload->'data'->>'pct')::int AS pct FROM rt_outbox
       WHERE channel = $1 AND payload->'data'->>'job_id' = $2 ORDER BY id`,
      [userChannel(uid), id],
    );
    expect(progress).toEqual([
      { step: 'draft', pct: 50 },
      { step: 'persist', pct: 100 },
    ]);
  });

  it('starts once per input and cancels the job an input change supersedes', async () => {
    const queue = uniqueQueue('agent_cancel');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ran: string[] = [];
    const job = defineAgentJob({
      kind: 'quests',
      queue,
      spec: keyed(),
      pollingIntervalSeconds: 0.5,
      steps: [
        {
          id: 'draft',
          run: async (ctx) => {
            const { name } = ctx.input as { name: string };
            if (name === 'first') await gate;
            ran.push(name);
            return { name };
          },
        },
      ],
    });
    const uid = await insertUser(harness.pool);
    await harness.startRuntime([job]);
    const input = { queue, userId: uid, stepIds: ['draft'] };
    const a = await start({ ...input, input: { name: 'first' } });
    const again = await start({ ...input, input: { name: 'first' } });
    expect(again).toEqual({ id: a.id, created: false, cancelledIds: [] });
    await until(async () => (await jobRow(harness.pool, a.id)).status === 'running', 10_000);

    const b = await start({ ...input, input: { name: 'second' } });
    expect(b).toMatchObject({ created: true, cancelledIds: [a.id] });
    release();
    await until(async () => (await jobRow(harness.pool, b.id)).status === 'succeeded', 15_000);
    await until(() => ran.length === 2, 10_000);

    const cancelled = await jobRow(harness.pool, a.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.steps[0]?.status).toBe('running');
    const { rows } = await harness.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM pgboss.job WHERE name = $1',
      [queue],
    );
    expect(rows[0]?.n).toBe(2);
  });

  it('compensates finished steps in reverse and marks the job failed on its last attempt', async () => {
    const queue = uniqueQueue('agent_fail');
    const compensated: unknown[] = [];
    const job = defineAgentJob({
      kind: 'quests',
      queue,
      spec: keyed({ retryLimit: 1, retryDelay: 0 }),
      pollingIntervalSeconds: 0.5,
      steps: [
        {
          id: 'reserve',
          run: () => Promise.resolve({ unit: 1 }),
          compensate: (result) => {
            compensated.push(result);
            return Promise.resolve();
          },
        },
        { id: 'draft', run: () => Promise.reject(new Error('model unavailable')), maxTries: 2 },
      ],
    });
    const uid = await insertUser(harness.pool);
    await harness.startRuntime([job]);
    const { id } = await start({
      queue,
      userId: uid,
      input: { n: randomUUID() },
      stepIds: ['reserve', 'draft'],
    });
    await until(async () => (await jobRow(harness.pool, id)).status === 'failed', 30_000);

    expect(compensated).toEqual([{ unit: 1 }]);
    const row = await jobRow(harness.pool, id);
    expect(row.steps[1]).toMatchObject({
      status: 'failed',
      attempts: 2,
      error: 'model unavailable',
    });
  });
});
