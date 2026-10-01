/**
 * An agent job whose AI route is switched off in the ops console, on a real pg-boss runtime: the
 * gateway refuses before the provider (the recorded-fixture boundary sees no request), the job
 * fails at once with its finished steps compensated, and the pg-boss job completes with the switch
 * key, so the queue neither retries nor dead-letters it.
 */
import { createGateway, resolveRoute, startAgentJob } from '@cp/ai';
import { fixtureTransport } from '@cp/ai/testing';
import { createKillSwitchReader, sendInTx, withSystem } from '@cp/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { batchStep } from '../../src/ai/batch-step';
import { defineAgentJob } from '../../src/ai/job-runner';
import type { DeadLetterAlert } from '../../src/boss';
import {
  fastSpec,
  startJobsHarness,
  uniqueQueue,
  until,
  type JobsHarness,
} from '../helpers/jobs-harness';
import { insertUser, jobRow } from './agent-job-fixtures';

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

describe('agent job with its AI route switched off', () => {
  it('ends on the first attempt without calling the provider, retrying or dead-lettering', async () => {
    await harness.pool.query(
      `INSERT INTO ops.ops_config (key, value) VALUES ('ai.quests.generate.enabled', 'false')`,
    );
    const queue = uniqueQueue('agent_switched_off');
    const switches = createKillSwitchReader(harness.pool, {
      tierOf: (route) => resolveRoute(route).tier,
    });
    const transport = fixtureTransport(['flash-quest-mural']);
    const gateway = createGateway({
      apiKey: 'fixture-key',
      fetch: transport.fetch,
      assertRouteOn: switches.assertAiRoute,
    });
    const compensated: unknown[] = [];
    const job = defineAgentJob({
      kind: 'quests',
      queue,
      spec: fastSpec({ policy: 'exclusive', retryLimit: 3, retryDelay: 1, deadLetter: true }),
      pollingIntervalSeconds: 0.5,
      steps: [
        {
          id: 'prepare',
          run: () => Promise.resolve({ prepared: true }),
          compensate: (result) => {
            compensated.push(result);
            return Promise.resolve();
          },
        },
        {
          ...batchStep(
            {
              id: 'generate',
              route: 'quests.generate',
              build: () =>
                Promise.resolve([
                  {
                    customId: 'quest-1',
                    input: { messages: [{ role: 'user', content: 'mural' }] },
                  },
                ]),
              onResult: () => Promise.resolve(),
            },
            { gateway },
          ),
          maxTries: 3,
        },
      ],
    });
    const alerts: DeadLetterAlert[] = [];
    await harness.startRuntime([job], { alerts });
    const uid = await insertUser(harness.pool);
    const { id } = await withSystem(harness.pool, (tx) =>
      startAgentJob(tx, (q, data, options) => sendInTx(tx, q, data, options), {
        kind: 'quests',
        queue,
        userId: uid,
        tripId: null,
        input: {},
        stepIds: ['prepare', 'generate'],
      }),
    );
    await until(async () => (await jobRow(harness.pool, id)).status === 'failed', 30_000);
    const boss = async () =>
      (
        await harness.pool.query<{ state: string; retry_count: number; output: unknown }>(
          'SELECT state, retry_count, output FROM pgboss.job WHERE name = $1',
          [queue],
        )
      ).rows[0];
    await until(async () => (await boss())?.state === 'completed', 10_000);

    expect(transport.urls).toHaveLength(0);
    expect(await boss()).toEqual({
      state: 'completed',
      retry_count: 0,
      output: { switched_off: 'ai.quests.generate.enabled' },
    });
    const row = await jobRow(harness.pool, id);
    expect(row.steps.map((s) => [s.step, s.status, s.attempts, s.error ?? null])).toEqual([
      ['prepare', 'done', 1, null],
      ['generate', 'failed', 1, 'switched_off: ai.quests.generate.enabled'],
    ]);
    expect(compensated).toEqual([{ prepared: true }]);
    expect(alerts).toHaveLength(0);
  });
});
