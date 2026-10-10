import { describe, expect, it } from 'vitest';

import {
  computeCostMicros,
  createGateway,
  GatewayError,
  isPeakTime,
  MODEL_IDS,
  PRICES,
  type AiUsageRecord,
  type GatewayStreamEvent,
  type TokenUsage,
  textOf,
} from '../src';
import { fixtureTransport, loadFixture } from './fixture-transport';

const USER_TURN = [{ role: 'user' as const, content: 'hi' }];
/** Monday 05:00 UTC: off-peak. Monday 02:00 UTC: peak. */
const AT = new Date('2026-09-28T05:00:00Z');
const PEAK = new Date('2026-09-28T02:00:00Z');
const ZERO: TokenUsage = {
  inputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  outputTokens: 0,
};

function gatewayFor(fixtures: readonly string[], now: Date = AT) {
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
    now: () => now,
  });
  return { gateway, transport, records, sleeps };
}

describe('computeCostMicros', () => {
  it('prices DeepSeek tokens from the list, cache hits at their own rate', () => {
    const million = { ...ZERO, inputTokens: 1_000_000 };
    expect(computeCostMicros('fast', million, AT)).toBe(150_000);
    expect(computeCostMicros('fast', { ...ZERO, cacheReadTokens: 1_000_000 }, AT)).toBe(3_000);
    expect(computeCostMicros('fast', { ...ZERO, outputTokens: 1_000_000 }, AT)).toBe(600_000);
    expect(computeCostMicros('pro', million, AT)).toBe(660_000);
    expect(computeCostMicros('pro', { ...ZERO, cacheReadTokens: 1_000_000 }, AT)).toBe(22_000);
    expect(computeCostMicros('pro', { ...ZERO, outputTokens: 1_000_000 }, AT)).toBe(1_980_000);
    // A reported cache write is billed as plain input.
    expect(computeCostMicros('fast', { ...ZERO, cacheWriteTokens: 1_000_000 }, AT)).toBe(150_000);
  });

  it('doubles every rate in the weekday peak windows only', () => {
    const usage = {
      ...ZERO,
      inputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      outputTokens: 1_000_000,
    };
    expect(computeCostMicros('pro', usage, PEAK)).toBe(2 * computeCostMicros('pro', usage, AT));
    expect(isPeakTime(new Date('2026-09-28T01:00:00Z'))).toBe(true);
    expect(isPeakTime(new Date('2026-09-28T03:59:59Z'))).toBe(true);
    expect(isPeakTime(new Date('2026-09-28T04:00:00Z'))).toBe(false);
    expect(isPeakTime(new Date('2026-09-28T06:00:00Z'))).toBe(true);
    expect(isPeakTime(new Date('2026-09-28T10:00:00Z'))).toBe(false);
    // Saturday and Sunday are off-peak all day.
    expect(isPeakTime(new Date('2026-09-26T02:00:00Z'))).toBe(false);
    expect(isPeakTime(new Date('2026-09-27T07:00:00Z'))).toBe(false);
  });

  it('bills a Jev decision on input tokens only at $0.042 per million, at any hour', () => {
    expect(PRICES.jev.peak.input).toBe(42_000);
    const usage = { ...ZERO, inputTokens: 1_000_000, outputTokens: 5_000 };
    expect(computeCostMicros('jev', usage, AT)).toBe(42_000);
    expect(computeCostMicros('jev', usage, PEAK)).toBe(42_000);
    expect(computeCostMicros('jev', { ...ZERO, inputTokens: 431, outputTokens: 80 }, AT)).toBe(18);
  });
});

describe('callModel against recorded DeepSeek responses', () => {
  it('bills a plain call and writes one usage record', async () => {
    const { gateway, records, transport } = gatewayFor(['flash-basic']);
    const result = await gateway.callModel('guide.chat', { messages: USER_TURN }, { userId: null });
    // 10 in, 2 out at the off-peak fast rate: 1.5 + 1.2 µ$.
    expect(result.costMicros).toBe(3);
    expect(transport.requests[0]).toMatchObject({ model: 'deepseek-flash' });
    expect(records).toEqual([
      expect.objectContaining({
        model: 'deepseek-flash',
        tier: 'fast',
        tokensIn: 10,
        tokensOut: 2,
        cacheRead: 0,
        at: AT,
      }),
    ]);
  });

  it('bills the same call at the peak rate inside a peak window', async () => {
    const { gateway } = gatewayFor(['flash-basic'], PEAK);
    expect((await gateway.callModel('guide.chat', { messages: USER_TURN })).costMicros).toBe(5);
  });

  it('prices a cache miss and a cache hit of the same prefix', async () => {
    const tripId = '0190f0a0-0000-7000-8000-000000000001';
    const { gateway, records } = gatewayFor(['flash-cache-miss', 'flash-cache-hit']);
    const first = await gateway.callModel('guide.chat', { messages: USER_TURN }, { tripId });
    const second = await gateway.callModel('guide.chat', { messages: USER_TURN }, { tripId });
    expect(first.costMicros).toBe(879);
    expect(second.costMicros).toBe(61);
    expect(records[1]).toMatchObject({ tokensIn: 5746, cacheRead: 5504, tripId, costMicros: 61 });
  });

  it('returns a tool call untouched and bills the turn that requested it', async () => {
    const { gateway, records } = gatewayFor(['flash-chat-noodles-tool-use']);
    const result = await gateway.callModel('guide.chat', { messages: USER_TURN });
    expect(result.message.stop_reason).toBe('tool_use');
    expect(result.message.content[1]).toMatchObject({ type: 'tool_use', name: 'places_search' });
    expect(result.costMicros).toBe(636);
    expect(records).toHaveLength(1);
  });

  it('maps the decline marker to AI_REFUSED after recording its billed usage', async () => {
    const { gateway, records } = gatewayFor(['pro-chat-decline-break-in']);
    const error = await gateway
      .callModel('guide.chat_escalation', { messages: USER_TURN })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toMatchObject({ code: 'AI_REFUSED', retryable: false });
    expect(records).toEqual([
      expect.objectContaining({ model: 'deepseek-v4-pro', tier: 'pro', costMicros: 5664 }),
    ]);
  });

  it('repairs a structured reply that is not JSON once, billing both calls', async () => {
    const { gateway, records, transport } = gatewayFor(['flash-basic', 'flash-quest-mural']);
    const outputFormat = { type: 'json_schema' as const, schema: { type: 'object' } };
    const result = await gateway.callModel('quests.generate', {
      messages: USER_TURN,
      outputFormat,
    });
    expect(textOf(result.message)).toMatch(/^\{"quests"/u);
    expect(records).toHaveLength(2);
    const repair = transport.requests[1] as { messages: { role: string; content: unknown }[] };
    expect(repair.messages.at(-1)).toMatchObject({ role: 'user' });
    expect(JSON.stringify(repair.messages.at(-1))).toContain('JSON');
  });

  it('retries an overloaded response with jittered backoff', async () => {
    const { gateway, sleeps } = gatewayFor(['anthropic/overloaded-529', 'flash-basic']);
    const result = await gateway.callModel('guide.chat', { messages: USER_TURN });
    expect(result.message.content[0]).toMatchObject({ type: 'text', text: 'Hello there' });
    expect(sleeps).toEqual([250]);
  });

  it('honours retry-after on a rate-limited response', async () => {
    const { gateway, sleeps } = gatewayFor(['anthropic/rate-limited-429', 'flash-basic']);
    await gateway.callModel('guide.chat', { messages: USER_TURN });
    expect(sleeps).toEqual([1000]);
  });

  it('gives up as AI_UNAVAILABLE once attempts run out', async () => {
    const { gateway, records } = gatewayFor([
      'anthropic/overloaded-529',
      'anthropic/overloaded-529',
      'anthropic/overloaded-529',
    ]);
    await expect(gateway.callModel('guide.chat', { messages: USER_TURN })).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      retryable: true,
    });
    expect(records).toEqual([]);
  });

  it('does not retry a request the provider rejected', async () => {
    const { gateway, sleeps } = gatewayFor(['invalid-request-422']);
    await expect(gateway.callModel('guide.chat', { messages: USER_TURN })).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      detail: { status: 422, transient: false },
    });
    expect(sleeps).toEqual([]);
  });
});

describe('streamModel against a recorded DeepSeek stream', () => {
  it('yields deltas, then one settled result with its cost', async () => {
    const { gateway, records } = gatewayFor(['flash-stream']);
    const events: GatewayStreamEvent[] = [];
    for await (const event of gateway.streamModel('guide.chat', { messages: USER_TURN })) {
      events.push(event);
    }
    expect(streamedText(events)).toMatch(/^Hi! Tokek here/u);
    const done = events.at(-1);
    expect(done?.kind).toBe('done');
    if (done?.kind === 'done') expect(done.result.costMicros).toBe(77);
    expect(records).toHaveLength(1);
  });

  it('never streams the decline marker and ends in AI_REFUSED', async () => {
    const { gateway, records } = gatewayFor(['flash-stream-decline']);
    const events: GatewayStreamEvent[] = [];
    const error = await (async () => {
      for await (const event of gateway.streamModel('guide.chat', { messages: USER_TURN })) {
        events.push(event);
      }
    })().catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'AI_REFUSED' });
    expect(streamedText(events)).toBe('');
    expect(records).toHaveLength(1);
  });
});

describe('calls the provider may have billed without answering', () => {
  function failingGateway(fetchImpl: typeof fetch) {
    const records: AiUsageRecord[] = [];
    const gateway = createGateway({
      apiKey: 'fixture-key',
      fetch: fetchImpl,
      timeoutMs: 20,
      onUsage: (record) => {
        records.push(record);
        return Promise.resolve();
      },
      sleep: () => Promise.resolve(),
      now: () => AT,
    });
    return { gateway, records };
  }

  /** A request the provider never answers: it ends only when the client gives up on it. */
  const hanging: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });

  /** The recorded stream's first `events` events, then a broken connection. */
  function breaksAfter(events: number): typeof fetch {
    const sse = loadFixture('flash-stream').response.sse ?? [];
    const encoder = new TextEncoder();
    return () => {
      let sent = false;
      // Erroring drops queued chunks, so the break comes on the read after the events.
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent) {
            controller.error(new TypeError('terminated'));
            return;
          }
          sent = true;
          const text = sse
            .slice(0, events)
            .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
            .join('');
          controller.enqueue(encoder.encode(text));
        },
      });
      const headers = { 'content-type': 'text/event-stream', 'request-id': 'req_broken' };
      return Promise.resolve(new Response(body, { status: 200, headers }));
    };
  }

  it('records a timed-out call with no tokens and no cost, and still fails it', async () => {
    const { gateway, records } = failingGateway(hanging);
    await expect(
      gateway.callModel('recap.narration', { messages: USER_TURN }, { tripId: 'trip-1' }),
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(records).toEqual([
      expect.objectContaining({
        route: 'recap.narration',
        model: MODEL_IDS.fast,
        tier: 'fast',
        tripId: 'trip-1',
        tokensIn: 0,
        tokensOut: 0,
        cacheRead: 0,
        costMicros: 0,
      }),
    ]);
  });

  it('records a timed-out stream once, without retrying it', async () => {
    const { gateway, records } = failingGateway(hanging);
    const run = async () => {
      for await (const _event of gateway.streamModel('guide.chat', { messages: USER_TURN })) {
        // Nothing arrives.
      }
    };
    await expect(run()).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ route: 'guide.chat', tokensIn: 0, costMicros: 0 });
  });

  it('bills a stream that broke part-way on the tokens it reported', async () => {
    const { gateway, records } = failingGateway(breaksAfter(6));
    const events: GatewayStreamEvent[] = [];
    const run = async () => {
      for await (const event of gateway.streamModel('guide.chat', { messages: USER_TURN })) {
        events.push(event);
      }
    };
    await expect(run()).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(events.length).toBeGreaterThan(0);
    // The prompt as message_start reported it; no output count arrived before the break.
    const reported: TokenUsage = { ...ZERO, inputTokens: 291, cacheReadTokens: 5504 };
    expect(records).toEqual([
      expect.objectContaining({
        route: 'guide.chat',
        tokensIn: 291 + 5504,
        tokensOut: 0,
        cacheRead: 5504,
        costMicros: computeCostMicros('fast', reported, AT),
      }),
    ]);
    expect(records[0]?.costMicros).toBeGreaterThan(0);
  });

  it('bills a stream its reader abandoned part-way', async () => {
    const { gateway, records } = gatewayFor(['flash-stream']);
    for await (const event of gateway.streamModel('guide.chat', { messages: USER_TURN })) {
      if (event.kind === 'delta' && event.event.type === 'content_block_delta') break;
    }
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ tokensIn: 291 + 5504, cacheRead: 5504, tokensOut: 0 });
  });
});

function streamedText(events: readonly GatewayStreamEvent[]): string {
  return events
    .flatMap((e) =>
      e.kind === 'delta' &&
      e.event.type === 'content_block_delta' &&
      e.event.delta.type === 'text_delta'
        ? [e.event.delta.text]
        : [],
    )
    .join('');
}
