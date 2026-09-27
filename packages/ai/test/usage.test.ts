import { describe, expect, it } from 'vitest';

import {
  computeCostMicros,
  createGateway,
  GatewayError,
  PRICES,
  type AiUsageRecord,
  type GatewayStreamEvent,
  type TokenUsage,
} from '../src';
import { fixtureTransport } from './fixture-transport';

const USER_TURN = [{ role: 'user' as const, content: 'hi' }];
const AT = new Date('2026-09-27T10:00:00Z');
const ZERO: TokenUsage = {
  inputTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  cacheReadTokens: 0,
  outputTokens: 0,
  webSearchRequests: 0,
};

function gatewayFor(fixtures: readonly string[]) {
  const transport = fixtureTransport(fixtures);
  const records: AiUsageRecord[] = [];
  const sleeps: number[] = [];
  const gateway = createGateway({
    apiKey: 'fixture-key',
    fetch: transport.fetch,
    onUsage: (record) => {
      records.push(record);
      return Promise.resolve();
    },
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    now: () => AT,
  });
  return { gateway, transport, records, sleeps };
}

describe('computeCostMicros', () => {
  it('prices every token class from the list-price table', () => {
    expect(computeCostMicros('haiku', { ...ZERO, inputTokens: 1000, outputTokens: 1000 })).toBe(
      6000,
    );
    expect(computeCostMicros('haiku', { ...ZERO, cacheWrite1hTokens: 1000 })).toBe(2000);
    expect(computeCostMicros('opus', { ...ZERO, cacheReadTokens: 1_000_000 })).toBe(200_000);
    expect(computeCostMicros('sonnet', { ...ZERO, webSearchRequests: 2 })).toBe(20_000);
  });

  it('halves token rates for batch calls, stacking with cache multipliers', () => {
    const usage = { ...ZERO, inputTokens: 1000, cacheReadTokens: 1000, outputTokens: 1000 };
    expect(computeCostMicros('sonnet', usage)).toBe(12_200);
    expect(computeCostMicros('sonnet', usage, { batch: true })).toBe(6100);
  });

  it('bills a Jev decision on input tokens only at $0.042 per million', () => {
    expect(PRICES.jev.input).toBe(42_000);
    const usage = { ...ZERO, inputTokens: 1_000_000, outputTokens: 5_000 };
    expect(computeCostMicros('jev', usage)).toBe(42_000);
    expect(computeCostMicros('jev', usage, { batch: true })).toBe(42_000);
    expect(computeCostMicros('jev', { ...ZERO, inputTokens: 431, outputTokens: 80 })).toBe(18);
  });
});

describe('callModel against recorded responses', () => {
  it('bills a plain call and writes one usage record', async () => {
    const { gateway, records, transport } = gatewayFor(['haiku-basic']);
    const result = await gateway.callModel('guide.chat', { messages: USER_TURN }, { userId: null });
    expect(result.costMicros).toBe(39);
    expect(transport.requests[0]).toMatchObject({ model: 'claude-haiku-4-5-20251001' });
    expect(records).toEqual([
      expect.objectContaining({ tier: 'haiku', tokensIn: 14, tokensOut: 5, cacheRead: 0, at: AT }),
    ]);
  });

  it('prices cache writes and cache reads separately', async () => {
    const tripId = '0190f0a0-0000-7000-8000-000000000001';
    const { gateway, records } = gatewayFor(['haiku-cache-write', 'haiku-cache-read']);
    const first = await gateway.callModel('guide.chat', { messages: USER_TURN }, { tripId });
    const second = await gateway.callModel('guide.chat', { messages: USER_TURN }, { tripId });
    expect(first.costMicros).toBe(5596);
    expect(second.costMicros).toBe(524);
    expect(records[1]).toMatchObject({ tokensIn: 4433, cacheRead: 4410, tripId, costMicros: 524 });
  });

  it('returns a tool call untouched and bills the turn that requested it', async () => {
    const { gateway, records } = gatewayFor(['haiku-tool-use']);
    const result = await gateway.callModel('guide.chat', { messages: USER_TURN });
    expect(result.message.stop_reason).toBe('tool_use');
    expect(result.message.content[1]).toMatchObject({ type: 'tool_use', name: 'places_search' });
    expect(result.costMicros).toBe(967);
    expect(records).toHaveLength(1);
  });

  it('maps a refusal to AI_REFUSED after recording its billed usage', async () => {
    const { gateway, records } = gatewayFor(['sonnet-refusal']);
    const error = await gateway
      .callModel('pitch.place', { messages: USER_TURN })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toMatchObject({ code: 'AI_REFUSED', retryable: false });
    expect((error as GatewayError).detail).toMatchObject({ category: 'general_harms' });
    expect(records).toEqual([expect.objectContaining({ tier: 'sonnet', costMicros: 92 })]);
  });

  it('retries an overloaded response with jittered backoff', async () => {
    const { gateway, sleeps } = gatewayFor(['overloaded-529', 'haiku-basic']);
    const result = await gateway.callModel('guide.chat', { messages: USER_TURN });
    expect(result.message.content[0]).toMatchObject({ type: 'text', text: 'Hello!' });
    expect(sleeps).toEqual([250]);
  });

  it('honours retry-after on a rate-limited response', async () => {
    const { gateway, sleeps } = gatewayFor(['rate-limited-429', 'haiku-basic']);
    await gateway.callModel('guide.chat', { messages: USER_TURN });
    expect(sleeps).toEqual([1000]);
  });

  it('gives up as AI_UNAVAILABLE once attempts run out', async () => {
    const { gateway, records } = gatewayFor(['overloaded-529', 'overloaded-529', 'overloaded-529']);
    await expect(gateway.callModel('guide.chat', { messages: USER_TURN })).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      retryable: true,
    });
    expect(records).toEqual([]);
  });
});

describe('streamModel against a recorded stream', () => {
  it('yields deltas, then one settled result with its cost', async () => {
    const { gateway, records } = gatewayFor(['haiku-stream']);
    const events: GatewayStreamEvent[] = [];
    for await (const event of gateway.streamModel('guide.chat', { messages: USER_TURN })) {
      events.push(event);
    }
    const text = events.flatMap((e) =>
      e.kind === 'delta' &&
      e.event.type === 'content_block_delta' &&
      e.event.delta.type === 'text_delta'
        ? [e.event.delta.text]
        : [],
    );
    expect(text.join('')).toBe('Sawasdee krub!');
    const done = events.at(-1);
    expect(done?.kind).toBe('done');
    if (done?.kind === 'done') expect(done.result.costMicros).toBe(49);
    expect(records).toHaveLength(1);
  });
});
