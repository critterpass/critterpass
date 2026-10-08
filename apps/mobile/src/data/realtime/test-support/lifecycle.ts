/**
 * Test helpers shared by the realtime suites: the OS lifecycle boundary as an emitter shaped like
 * React Native's `AppState`, and polling waits for real network effects.
 */
import type { AppStateSource } from '../client';
import { pause } from '@/lib/test-support/settle';

export interface Lifecycle extends AppStateSource {
  emit(state: string): void;
}

export function lifecycle(initial = 'active'): Lifecycle {
  const listeners = new Set<(state: string) => void>();
  let current = initial;
  return {
    get currentState() {
      return current;
    },
    addEventListener: (_type, listener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    emit(state) {
      current = state;
      for (const listener of listeners) listener(state);
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return pause(ms);
}

/** Polls `condition` every 20 ms until it holds, failing after `timeoutMs`. */
export async function waitUntil(
  condition: () => boolean,
  timeoutMs = 5000,
  label = 'condition',
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- test failure message.
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(20);
  }
}
