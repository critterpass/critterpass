import { describe, expect, it } from '@jest/globals';

import { createBargeIn, type BargeInPort, type Interruption } from '../src/barge-in';
import type { PlaybackEvent } from '../src/CpSpeechModule';

/** The native module is the boundary: a stand-in that emits its events and records cancels. */
function fakePort(echoCancellation: boolean) {
  const listeners = new Map<string, Set<(event: never) => void>>();
  let cancels = 0;
  const port = {
    addListener(event: string, listener: (event: never) => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return { remove: () => set.delete(listener) };
    },
    cancelPlayback: () => {
      cancels += 1;
      emit('onPlayback', { state: 'cancelled' });
    },
    capabilities: () => ({ echoCancellation }),
  } as unknown as BargeInPort;
  function emit(event: string, payload: unknown) {
    for (const listener of listeners.get(event) ?? []) (listener as (e: unknown) => void)(payload);
  }
  return {
    port,
    playback: (event: PlaybackEvent) => emit('onPlayback', event),
    speech: () => emit('onSpeechStart', { playing: true, atMs: 0 }),
    cancels: () => cancels,
    listeners: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
  };
}

describe('barge-in', () => {
  it('stops the reply in the same event the user starts talking over it', () => {
    const native = fakePort(true);
    const interruptions: Interruption[] = [];
    const bargeIn = createBargeIn(native.port, (i) => interruptions.push(i));
    native.playback({ state: 'started', turn: 't1', seq: 0 });
    expect(bargeIn.replying).toBe(true);
    native.speech();
    expect(native.cancels()).toBe(1);
    expect(interruptions).toEqual([{ turn: 't1', by: 'speech' }]);
    expect(bargeIn.replying).toBe(false);
  });

  it('ignores speech when no reply is on, and after the reply played out', () => {
    const native = fakePort(true);
    const interruptions: Interruption[] = [];
    const bargeIn = createBargeIn(native.port, (i) => interruptions.push(i));
    native.speech();
    native.playback({ state: 'started', turn: 't1', seq: 0 });
    bargeIn.streamEnded('t1');
    native.playback({ state: 'drained', turn: 't1', seq: 3 });
    native.speech();
    expect(native.cancels()).toBe(0);
    expect(interruptions).toEqual([]);
  });

  it('still interrupts in a pause between chunks while the server is speaking', () => {
    const native = fakePort(true);
    const interruptions: Interruption[] = [];
    createBargeIn(native.port, (i) => interruptions.push(i));
    native.playback({ state: 'started', turn: 't1', seq: 0 });
    native.playback({ state: 'drained', turn: 't1', seq: 1 });
    native.speech();
    expect(interruptions).toEqual([{ turn: 't1', by: 'speech' }]);
  });

  it('without echo cancellation only a tap interrupts', () => {
    const native = fakePort(false);
    const interruptions: Interruption[] = [];
    const bargeIn = createBargeIn(native.port, (i) => interruptions.push(i));
    expect(bargeIn.bySpeech).toBe(false);
    native.playback({ state: 'started', turn: 't1', seq: 0 });
    native.speech();
    expect(native.cancels()).toBe(0);
    bargeIn.interrupt();
    expect(interruptions).toEqual([{ turn: 't1', by: 'tap' }]);
  });

  it('dispose removes its listeners', () => {
    const native = fakePort(true);
    const bargeIn = createBargeIn(native.port, () => {});
    expect(native.listeners()).toBe(2);
    bargeIn.dispose();
    expect(native.listeners()).toBe(0);
  });
});
