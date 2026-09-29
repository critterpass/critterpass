/**
 * When `start_pass` goes out. Draft edits only ask for a number (`request`), they never resend:
 * one request is in flight at a time; a transient failure (`unavailable`) retries on a backoff
 * timer or the moment the device is back online; a refusal (`rejected`, the server's
 * `retryable: false`) is final for this session, since the same request would be refused again.
 * The pass then keeps its placeholder number until `issue_pass` gives it the next one.
 */
import type { SendResult } from '@/data/commands/client';
import { backoffDelayMs, type BackoffPolicy } from '@/data/powersync/upload-queue';
import type { NetworkSource } from '@/data/status/network';

export type NumberReserverState = 'idle' | 'sending' | 'waiting' | 'refused' | 'reserved';

export const RESERVE_BACKOFF: BackoffPolicy = {
  baseMs: 2_000,
  maxMs: 120_000,
  random: Math.random,
};

export interface NumberReserverOptions {
  /** The payload to send now, or null once the number is no longer wanted (reserved, issued). */
  readonly payload: () => { readonly pass_id: string } | null;
  readonly send: (payload: { readonly pass_id: string }) => Promise<SendResult>;
  readonly onApplied: (result: unknown) => void;
  readonly network: NetworkSource;
  readonly backoff?: BackoffPolicy;
}

export function createNumberReserver(options: NumberReserverOptions) {
  const backoff = options.backoff ?? RESERVE_BACKOFF;
  let state: NumberReserverState = 'idle';
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function attempt(): void {
    if (stopped || state === 'sending' || state === 'refused' || state === 'reserved') return;
    clearTimer();
    const payload = options.payload();
    if (payload === null) {
      state = 'idle';
      return;
    }
    state = 'sending';
    void options.send(payload).then(
      (result) => settle(result),
      () => settle({ kind: 'unavailable', opId: '', code: 'NETWORK' }),
    );
  }

  function settle(result: SendResult): void {
    if (stopped) return;
    if (result.kind === 'applied') {
      state = 'reserved';
      options.onApplied(result.result);
    } else if (result.kind === 'rejected') {
      state = 'refused';
    } else {
      failures += 1;
      state = 'waiting';
      timer = setTimeout(
        () => {
          timer = null;
          state = 'idle';
          attempt();
        },
        backoffDelayMs(failures, backoff),
      );
    }
  }

  const unsubscribe = options.network.subscribe((online) => {
    if (online && state === 'waiting') {
      state = 'idle';
      attempt();
    }
  });

  return {
    /** A draft wants a number: sends unless one is in flight, backing off, refused or reserved. */
    request(): void {
      if (state === 'idle') attempt();
    },
    state: (): NumberReserverState => state,
    stop(): void {
      stopped = true;
      clearTimer();
      unsubscribe();
    },
  };
}

export type NumberReserver = ReturnType<typeof createNumberReserver>;
