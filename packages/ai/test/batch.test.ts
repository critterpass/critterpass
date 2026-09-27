import { describe, expect, it } from 'vitest';

import { createBatchClient, GatewayConfigError } from '../src';
import { fixtureTransport } from './fixture-transport';

const AT = new Date('2026-09-27T11:00:00Z');
const JOB = '0190f0a0-0000-7000-8000-00000000000a';
const turn = (text: string) => ({ messages: [{ role: 'user' as const, content: text }] });

function clientFor(fixtures: readonly string[]) {
  const transport = fixtureTransport(fixtures);
  const client = createBatchClient({
    apiKey: 'fixture-key',
    fetch: transport.fetch,
    now: () => AT,
  });
  return { client, transport };
}

describe('Message Batches wrapper', () => {
  it('submits one routed request per custom_id', async () => {
    const { client, transport } = clientFor(['batch-create']);
    const status = await client.submit('quests.generate', [
      { customId: 'quest-1', input: turn('gecko mural') },
      { customId: 'quest-2', input: turn('kopi') },
    ]);
    expect(status).toMatchObject({
      id: 'msgbatch_01FixtureQuestsBatch0001',
      status: 'in_progress',
    });
    expect(transport.methods).toEqual(['POST']);
    expect(transport.urls[0]).toMatch(/\/v1\/messages\/batches$/);
    const body = transport.requests[0] as { requests: { custom_id: string; params: object }[] };
    expect(body.requests.map((request) => request.custom_id)).toEqual(['quest-1', 'quest-2']);
    expect(body.requests[0]?.params).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'user', content: 'gecko mural' }],
    });
  });

  it('rejects empty batches, malformed and duplicate custom ids before any request', async () => {
    const { client, transport } = clientFor([]);
    await expect(client.submit('quests.generate', [])).rejects.toBeInstanceOf(GatewayConfigError);
    await expect(
      client.submit('quests.generate', [{ customId: 'quest 1', input: turn('x') }]),
    ).rejects.toThrow(/custom_id/);
    await expect(
      client.submit('quests.generate', [
        { customId: 'q', input: turn('x') },
        { customId: 'q', input: turn('y') },
      ]),
    ).rejects.toThrow(/duplicate/);
    expect(transport.requests).toHaveLength(0);
  });

  it('reads processing status and request counts', async () => {
    const { client } = clientFor(['batch-in-progress', 'batch-ended']);
    expect(await client.retrieve('msgbatch_01FixtureQuestsBatch0001')).toMatchObject({
      status: 'in_progress',
      endedAt: null,
    });
    expect(await client.retrieve('msgbatch_01FixtureQuestsBatch0001')).toMatchObject({
      status: 'ended',
      counts: { succeeded: 2, errored: 1, processing: 0 },
    });
  });

  it('maps results back by custom_id at batch prices, whatever order they arrive in', async () => {
    const { client, transport } = clientFor(['batch-ended', 'batch-results']);
    const results = await client.results('msgbatch_01FixtureQuestsBatch0001', 'quests.generate', {
      jobId: JOB,
    });
    expect(transport.urls[1]).toMatch(/\/results$/);
    const byId = new Map(results.map((result) => [result.customId, result]));
    expect(byId.get('quest-3')).toEqual({
      customId: 'quest-3',
      type: 'errored',
      errorType: 'invalid_request_error',
      errorMessage: 'max_tokens: must be at most 64000',
    });
    // Haiku at half price: 1000 in + 4000 cache reads + 200 out = 1200 µ$; 1200/4000/300 = 1550 µ$.
    expect(byId.get('quest-1')).toMatchObject({
      type: 'succeeded',
      refused: false,
      costMicros: 1200,
    });
    expect(byId.get('quest-2')).toMatchObject({ type: 'succeeded', costMicros: 1550 });
    const first = byId.get('quest-1');
    if (first?.type !== 'succeeded') throw new Error('quest-1 did not succeed');
    expect(first.record).toMatchObject({
      jobId: JOB,
      tier: 'haiku',
      tokensIn: 5000,
      tokensOut: 200,
      cacheRead: 4000,
      costMicros: 1200,
      at: AT,
    });
  });
});
