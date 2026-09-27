import { describe, expect, it } from 'vitest';

import {
  createGateway,
  GatewayConfigError,
  runBatch,
  textOf,
  type AiUsageRecord,
  type BatchItemResult,
} from '../src';
import { fixtureTransport } from './fixture-transport';

const AT = new Date('2026-09-28T05:00:00Z');
const JOB = '0190f0a0-0000-7000-8000-00000000000a';
const turn = (text: string) => ({ messages: [{ role: 'user' as const, content: text }] });

function gatewayFor(fixtures: readonly string[]) {
  const transport = fixtureTransport(fixtures);
  const records: AiUsageRecord[] = [];
  const gateway = createGateway({
    apiKey: 'fixture-key',
    fetch: transport.fetch,
    maxAttempts: 2,
    sleep: () => Promise.resolve(),
    now: () => AT,
    onUsage: (record) => (records.push(record), Promise.resolve()),
  });
  return { gateway, transport, records };
}

describe('batch work as direct calls', () => {
  it('runs every request through the gateway, each billed to the job on its own row', async () => {
    const { gateway, transport, records } = gatewayFor(['flash-quest-mural', 'flash-quest-kopi']);
    const delivered: string[] = [];
    const results = await runBatch(
      gateway,
      'quests.generate',
      [
        { customId: 'quest-1', input: turn('gecko mural') },
        { customId: 'quest-2', input: turn('kopi') },
      ],
      {
        concurrency: 1,
        context: { jobId: JOB },
        onResult: (result) => (delivered.push(result.customId), Promise.resolve()),
      },
    );
    expect(transport.urls).toEqual([
      'https://api.deepseek.com/anthropic/v1/messages',
      'https://api.deepseek.com/anthropic/v1/messages',
    ]);
    expect(transport.requests.map((r) => r.model)).toEqual(['deepseek-flash', 'deepseek-flash']);
    expect(delivered).toEqual(['quest-1', 'quest-2']);
    expect(results.map((r) => [r.customId, r.type])).toEqual([
      ['quest-1', 'succeeded'],
      ['quest-2', 'succeeded'],
    ]);
    const first = results[0] as Extract<BatchItemResult, { type: 'succeeded' }>;
    expect(textOf(first.message)).toMatch(/^\{"quests"/u);
    // No batch discount: 112 in and 94 out at the off-peak fast rate.
    expect(first.costMicros).toBe(73);
    expect(records.map((r) => [r.jobId, r.tier, r.costMicros])).toEqual([
      [JOB, 'fast', 73],
      [JOB, 'fast', 87],
    ]);
  });

  it('reports a request the provider rejects as errored and carries on', async () => {
    const { gateway } = gatewayFor(['invalid-request-422', 'flash-quest-kopi']);
    const results = await runBatch(
      gateway,
      'quests.generate',
      [
        { customId: 'bad', input: turn('x') },
        { customId: 'good', input: turn('kopi') },
      ],
      { concurrency: 1 },
    );
    expect(results).toEqual([
      {
        customId: 'bad',
        type: 'errored',
        code: 'AI_UNAVAILABLE',
        errorMessage: 'model provider request failed',
      },
      expect.objectContaining({ customId: 'good', type: 'succeeded' }),
    ]);
  });

  it('stops on a transient failure after delivering what finished, so a retry resumes', async () => {
    const { gateway, transport } = gatewayFor([
      'flash-quest-mural',
      'anthropic/overloaded-529',
      'anthropic/overloaded-529',
    ]);
    const delivered: string[] = [];
    const run = runBatch(
      gateway,
      'quests.generate',
      [
        { customId: 'quest-1', input: turn('gecko mural') },
        { customId: 'quest-2', input: turn('kopi') },
        { customId: 'quest-3', input: turn('night market') },
      ],
      { concurrency: 1, onResult: (r) => (delivered.push(r.customId), Promise.resolve()) },
    );
    await expect(run).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', retryable: true });
    expect(delivered).toEqual(['quest-1']);
    // quest-3 never started.
    expect(transport.requests).toHaveLength(3);
  });

  it('rejects malformed and duplicate custom ids before any request', async () => {
    const { gateway, transport } = gatewayFor([]);
    await expect(
      runBatch(gateway, 'quests.generate', [{ customId: 'quest 1', input: turn('x') }]),
    ).rejects.toBeInstanceOf(GatewayConfigError);
    await expect(
      runBatch(gateway, 'quests.generate', [
        { customId: 'q', input: turn('x') },
        { customId: 'q', input: turn('y') },
      ]),
    ).rejects.toThrow(/duplicate/u);
    expect(transport.requests).toHaveLength(0);
  });
});
