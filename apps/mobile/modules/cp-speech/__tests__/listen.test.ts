import { describe, expect, it } from '@jest/globals';

import type { SocketLike } from '../src/deepgram';
import { startListening, type ListenPort } from '../src/listen';
import session from './fixtures/deepgram-live-vi.json';

/** The native module is the boundary: it emits what the device would and records calls. */
function fakeNative(onDevice: boolean) {
  const listeners = new Map<string, Set<(event: never) => void>>();
  const calls: unknown[][] = [];
  const emit = (event: string, payload: unknown) => {
    for (const listener of listeners.get(event) ?? []) (listener as (e: unknown) => void)(payload);
  };
  let onStop: () => void = () => {};
  const port: ListenPort = {
    start: (locale, engine) => {
      calls.push(['start', locale, engine]);
      return Promise.resolve();
    },
    stop: () => {
      calls.push(['stop']);
      onStop();
      return Promise.resolve();
    },
    isOnDeviceSupported: () => Promise.resolve(onDevice),
    addListener: (event, listener) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return { remove: () => set.delete(listener) };
    },
  };
  return {
    port,
    calls,
    emit,
    whenStopped: (fn: () => void) => (onStop = fn),
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
}

const token = { token: 'k', scheme: 'bearer' as const, expires_at: '2026-10-06T05:13:44Z' };

describe('startListening', () => {
  it('uses the on-device recogniser where the platform has the locale', async () => {
    const native = fakeNative(true);
    const partials: string[] = [];
    const listening = await startListening(native.port, {
      locale: 'vi-VN',
      getToken: () => Promise.reject(new Error('not needed')),
      onPartial: (text) => partials.push(text),
    });
    expect(listening.engine).toBe('device');
    expect(native.calls[0]).toEqual(['start', 'vi-VN', 'device']);
    native.emit('onPartial', { text: 'cho tôi' });
    native.whenStopped(() => native.emit('onFinal', { text: 'Cho tôi hỏi.' }));
    await expect(listening.stop()).resolves.toBe('Cho tôi hỏi.');
    expect(partials).toEqual(['cho tôi']);
    expect(native.listenerCount()).toBe(0);
  });

  it('streams the mic to Deepgram where the device has no model', async () => {
    const native = fakeNative(false);
    const partials: string[] = [];
    let socket: (SocketLike & { sent: unknown[] }) | null = null;
    const listening = await startListening(native.port, {
      locale: 'vi',
      getToken: () => Promise.resolve(token),
      onPartial: (text) => partials.push(text),
      createSocket: () => {
        const sent: unknown[] = [];
        socket = {
          binaryType: 'blob',
          readyState: 1,
          onopen: null,
          onmessage: null,
          onerror: null,
          onclose: null,
          sent,
          send: (data) => sent.push(data),
          close: () => {},
        };
        return socket;
      },
    });
    expect(listening.engine).toBe('stream');
    expect(native.calls[0]).toEqual(['start', 'vi', 'stream']);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const ws = socket!;
    ws.onopen?.({});
    native.emit('onAudio', { pcm: btoa('\u0001\u0002') });
    expect(ws.sent).toHaveLength(1);
    for (const m of session.server) ws.onmessage?.({ data: JSON.stringify(m) });
    const final = listening.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const m of session.afterFinalize) ws.onmessage?.({ data: JSON.stringify(m) });
    await expect(final).resolves.toBe(session.expected.final);
    expect(partials.at(-1)).toBe(session.expected.final);
  });

  it('falls back to the last partial when the final text never arrives', async () => {
    const native = fakeNative(true);
    const listening = await startListening(native.port, {
      locale: 'en-US',
      getToken: () => Promise.reject(new Error('not needed')),
      onPartial: () => {},
      finalTimeoutMs: 10,
    });
    native.emit('onPartial', { text: 'where is the ferry' });
    await expect(listening.stop()).resolves.toBe('where is the ferry');
  });
});
