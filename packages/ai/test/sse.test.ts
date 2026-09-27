import { describe, expect, it } from 'vitest';

import { encodeSseEvent, SSE_HEARTBEAT, sseStream, type TurnEvent } from '../src';

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe('encodeSseEvent', () => {
  it('writes the type as the event name and the rest as JSON data', () => {
    expect(encodeSseEvent({ type: 'token', text: 'Xin chào' }, 3)).toBe(
      'id: 3\nevent: token\ndata: {"text":"Xin chào"}\n\n',
    );
    expect(encodeSseEvent({ type: 'error', code: 'AI_REFUSED', retryable: false })).toBe(
      'event: error\ndata: {"code":"AI_REFUSED","retryable":false}\n\n',
    );
  });
});

describe('sseStream', () => {
  it('streams every event in order with increasing ids, then closes', async () => {
    async function* turn(): AsyncGenerator<TurnEvent, void, undefined> {
      await Promise.resolve();
      yield { type: 'token', text: 'Hi' };
      yield { type: 'done', ai_generated: true, sources: [] };
    }
    const text = await readAll(sseStream(turn()));
    expect(text).toBe(
      'id: 1\nevent: token\ndata: {"text":"Hi"}\n\n' +
        'id: 2\nevent: done\ndata: {"ai_generated":true,"sources":[]}\n\n',
    );
  });

  it('sends heartbeats while the turn is quiet, without losing the pending event', async () => {
    let resume: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    async function* turn(): AsyncGenerator<TurnEvent, void, undefined> {
      await gate;
      yield { type: 'token', text: 'late' };
    }
    const reader = sseStream(turn(), { heartbeatMs: 5 }).getReader();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toBe(SSE_HEARTBEAT);
    resume();
    let next = decoder.decode((await reader.read()).value);
    while (next === SSE_HEARTBEAT) next = decoder.decode((await reader.read()).value);
    expect(next).toContain('event: token');
    expect((await reader.read()).done).toBe(true);
  });

  it('aborts and finishes the turn when the client cancels', async () => {
    const abort = new AbortController();
    let cleanedUp = false;
    async function* turn(): AsyncGenerator<TurnEvent, void, undefined> {
      try {
        await Promise.resolve();
        yield { type: 'token', text: 'one' };
        yield { type: 'token', text: 'two' };
      } finally {
        cleanedUp = true;
      }
    }
    const reader = sseStream(turn(), { abort }).getReader();
    await reader.read();
    await reader.cancel();
    expect(abort.signal.aborted).toBe(true);
    expect(cleanedUp).toBe(true);
  });
});
