/**
 * Wall-clock deadlines at the network boundary: the fake `fetch` answers 200 and then holds the body
 * open (a keep-alive newline, nothing more), as a stalled provider does. The real SDK client runs
 * end to end; only `fetch` is swapped.
 */
import { describe, expect, it } from 'vitest';

import {
  createGateway,
  GatewayError,
  routeDeadlineMs,
  type AiUsageRecord,
  type GatewayStreamEvent,
} from '../src';
import { loadFixture } from './fixture-transport';

const USER_TURN = [{ role: 'user' as const, content: 'hi' }];
// Long enough that event-loop jitter on a slow runner cannot eat the retry's half of the budget.
const DEADLINE_MS = 400;
const encoder = new TextEncoder();

type Reply = (signal: AbortSignal | undefined) => Response;

/** A 200 whose body sends `chunks`, then nothing until the request is aborted. */
function stalled(chunks: readonly string[], contentType: string): Reply {
  return (signal) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        signal?.addEventListener('abort', () => controller.error(signal.reason));
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': contentType } });
  };
}

const hanging = stalled(['\n'], 'application/json');

function json(body: unknown): Reply {
  return () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
}

const flashBasic = loadFixture('flash-basic').response.body as Record<string, unknown>;

function sse(events: readonly Record<string, unknown>[]): string {
  return events.map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

const STREAM_HEAD = sse([
  {
    type: 'message_start',
    message: {
      id: 'msg_stall',
      type: 'message',
      role: 'assistant',
      model: 'deepseek-flash',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 0 },
    },
  },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello there' } },
]);

function gatewayWith(replies: readonly Reply[]) {
  const queue = [...replies];
  const aborted: boolean[] = [];
  const records: AiUsageRecord[] = [];
  const fetch = (_input: unknown, init?: RequestInit): Promise<Response> => {
    const reply = queue.shift();
    if (reply === undefined) throw new Error('no reply left');
    const signal = init?.signal ?? undefined;
    const index = aborted.push(false) - 1;
    signal?.addEventListener('abort', () => (aborted[index] = true));
    return Promise.resolve(reply(signal));
  };
  const gateway = createGateway({
    apiKey: 'fixture-key',
    fetch,
    timeoutMs: DEADLINE_MS,
    streamIdleMs: DEADLINE_MS,
    maxAttempts: 3,
    sleep: () => Promise.resolve(),
    random: () => 0,
    onUsage: (record) => {
      records.push(record);
      return Promise.resolve();
    },
  });
  return { gateway, aborted, records, requests: () => aborted.length };
}

async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await run();
  return { value, ms: performance.now() - start };
}

describe('routeDeadlineMs', () => {
  it('gives short replies a minute and large output budgets time to generate', () => {
    expect(routeDeadlineMs({ maxTokens: 256 })).toBe(60_000);
    expect(routeDeadlineMs({ maxTokens: 4096 })).toBe(132_400);
    expect(routeDeadlineMs({ maxTokens: 16_000 })).toBe(430_000);
  });
});

describe('callModel deadline', () => {
  it('aborts a reply held open past the deadline and retries within twice the deadline', async () => {
    const { gateway, aborted, requests } = gatewayWith([hanging, hanging, hanging]);
    const { value: error, ms } = await timed(() =>
      gateway.callModel('guide.chat', { messages: USER_TURN }).catch((e: unknown) => e),
    );
    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toMatchObject({
      code: 'AI_UNAVAILABLE',
      retryable: true,
      detail: { reason: 'timeout', phase: 'reply', transient: true },
    });
    // The budget leaves room for one retry, not the third attempt maxAttempts would allow.
    expect(requests()).toBe(2);
    expect(aborted).toEqual([true, true]);
    expect(ms).toBeGreaterThanOrEqual(DEADLINE_MS);
    expect(ms).toBeLessThan(2 * DEADLINE_MS + 250);
  });

  it('answers from the retry when only the first attempt stalls', async () => {
    const { gateway, records } = gatewayWith([hanging, json(flashBasic)]);
    const result = await gateway.callModel('guide.chat', { messages: USER_TURN });
    expect(result.message.content[0]).toMatchObject({ type: 'text', text: 'Hello there' });
    expect(records).toHaveLength(1);
  });
});

describe('a reply without usage', () => {
  const { usage: _usage, ...noUsage } = flashBasic;

  it('is retried as an incomplete reply and the good answer is billed', async () => {
    const { gateway, records, requests } = gatewayWith([json(noUsage), json(flashBasic)]);
    const result = await gateway.callModel('guide.chat', { messages: USER_TURN });
    expect(result.usage.inputTokens).toBe(10);
    expect(requests()).toBe(2);
    expect(records).toHaveLength(1);
  });

  it('fails as a retryable AI_UNAVAILABLE instead of crashing once attempts run out', async () => {
    const { gateway, records } = gatewayWith([json(noUsage), json(noUsage), json(noUsage)]);
    await expect(gateway.callModel('guide.chat', { messages: USER_TURN })).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      retryable: true,
      detail: { reason: 'incomplete_reply' },
    });
    expect(records).toEqual([]);
  });
});

describe('streamModel deadlines', () => {
  async function drain(events: AsyncGenerator<GatewayStreamEvent>, into: GatewayStreamEvent[]) {
    try {
      for await (const event of events) into.push(event);
      return undefined;
    } catch (error) {
      return error;
    }
  }

  it('aborts a stream that goes quiet after its first token, without a retry', async () => {
    const { gateway, aborted, requests } = gatewayWith([
      stalled([STREAM_HEAD], 'text/event-stream'),
    ]);
    const events: GatewayStreamEvent[] = [];
    const { value: error, ms } = await timed(() =>
      drain(gateway.streamModel('guide.chat', { messages: USER_TURN }), events),
    );
    expect(events.some((e) => e.kind === 'delta')).toBe(true);
    expect(error).toMatchObject({
      code: 'AI_UNAVAILABLE',
      detail: { reason: 'timeout', phase: 'idle' },
    });
    expect(requests()).toBe(1);
    expect(aborted).toEqual([true]);
    expect(ms).toBeLessThan(DEADLINE_MS + 250);
  });

  it('retries a stream that sends nothing before the first-event deadline', async () => {
    const { gateway, requests } = gatewayWith([
      stalled([], 'text/event-stream'),
      stalled([], 'text/event-stream'),
      stalled([], 'text/event-stream'),
    ]);
    const { value: error, ms } = await timed(() =>
      drain(gateway.streamModel('guide.chat', { messages: USER_TURN }), []),
    );
    expect(error).toMatchObject({ code: 'AI_UNAVAILABLE', detail: { phase: 'first_event' } });
    expect(requests()).toBe(2);
    expect(ms).toBeLessThan(2 * DEADLINE_MS + 250);
  });
});
