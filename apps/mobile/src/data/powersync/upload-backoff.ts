/**
 * How long the upload queue waits before a retry: exponential in the number of failures in a row,
 * capped, with jitter so phones that lost the server together do not come back together.
 */
export interface BackoffPolicy {
  readonly baseMs: number;
  readonly maxMs: number;
  /** Jitter source in [0, 1]; the delay is drawn from [delay/2, delay]. */
  readonly random: () => number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = {
  baseMs: 1_000,
  maxMs: 300_000,
  random: Math.random,
};

export function backoffDelayMs(failures: number, policy: BackoffPolicy): number {
  const full = Math.min(policy.maxMs, policy.baseMs * 2 ** Math.max(0, failures - 1));
  return Math.round(full / 2 + policy.random() * (full / 2));
}
