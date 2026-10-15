/**
 * Wall-clock deadlines for provider calls. The SDK's own `timeout` stops counting once response
 * headers arrive, so a provider that answers 200 and then holds the body open (keep-alive bytes,
 * no content) would hang a call for minutes. Every attempt here runs under its own
 * `AbortController`: at the deadline the request is aborted and the call rejects with
 * `DeadlineExceeded` even if the transport ignores the abort.
 */
import type { RouteConfig } from './routing';

/** Which wait ran out: the whole reply, the first stream event, or the gap between two events. */
export type DeadlinePhase = 'reply' | 'first_event' | 'idle';

export class DeadlineExceeded extends Error {
  readonly phase: DeadlinePhase;
  readonly timeoutMs: number;

  constructor(phase: DeadlinePhase, timeoutMs: number) {
    super(`model provider gave no ${phase.replace('_', ' ')} within ${timeoutMs} ms`);
    this.name = 'DeadlineExceeded';
    this.phase = phase;
    this.timeoutMs = timeoutMs;
  }
}

/** The floor for any call: a short reply that takes longer than this is a stalled provider. */
export const MIN_DEADLINE_MS = 60_000;
/** Allowance for queueing and time to the first token on top of generation. */
const BASE_DEADLINE_MS = 30_000;
/** A slow but healthy generation rate; a route's deadline covers its whole output budget at it. */
const MIN_TOKENS_PER_SECOND = 40;
/** The silence allowed between two events of a stream that has started. */
export const STREAM_IDLE_MS = 30_000;

/**
 * The deadline of one attempt on a route: 60 s for short replies, longer for routes whose output
 * budget (thinking included) cannot be generated in a minute.
 */
export function routeDeadlineMs(route: Pick<RouteConfig, 'maxTokens'>): number {
  const generation = Math.ceil((route.maxTokens / MIN_TOKENS_PER_SECOND) * 1000);
  return Math.max(MIN_DEADLINE_MS, BASE_DEADLINE_MS + generation);
}

/**
 * Settles with `promise`, or aborts `controller` and rejects with `DeadlineExceeded` after `ms`.
 * The race keeps the deadline even when the aborted transport never settles.
 */
export async function within<T>(
  promise: Promise<T>,
  ms: number,
  phase: DeadlinePhase,
  controller: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new DeadlineExceeded(phase, ms);
      controller.abort(error);
      reject(error);
    }, ms);
  });
  try {
    return await Promise.race([promise, expired]);
  } finally {
    clearTimeout(timer);
  }
}

/** One attempt's abort signal: the caller's cancel (client disconnect) or our deadline. */
export function attemptSignal(controller: AbortController, outer: AbortSignal | undefined) {
  return outer === undefined ? controller.signal : AbortSignal.any([outer, controller.signal]);
}
