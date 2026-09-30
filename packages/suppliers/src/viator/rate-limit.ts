/**
 * Viator's per-endpoint allowance is counted over a rolling 10-second window against the partner
 * account (Partner API "Rate limiting"): every call waits its turn here so the adapter never sends
 * more than an endpoint's allowance in any 10 seconds, whatever the callers do concurrently.
 * Allowances are configured per endpoint (the `RateLimit-Limit` Viator shows for the account),
 * with a conservative default for the rest.
 */

export const VIATOR_RATE_WINDOW_MS = 10_000;
/** Until Viator tells us an endpoint's allowance, assume this many calls per window. */
export const DEFAULT_ENDPOINT_ALLOWANCE = 10;

export interface RollingLimiterOptions {
  readonly windowMs?: number;
  readonly defaultAllowance?: number;
  /** Calls per window, per endpoint label. */
  readonly allowances?: Readonly<Record<string, number>>;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface RollingLimiter {
  /** Resolves once a call to `endpoint` fits in the window; the call is counted from then. */
  acquire(endpoint: string): Promise<void>;
  /** Calls counted for `endpoint` in the current window (for tests and metrics). */
  inWindow(endpoint: string): number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createRollingLimiter(options: RollingLimiterOptions = {}): RollingLimiter {
  const windowMs = options.windowMs ?? VIATOR_RATE_WINDOW_MS;
  const fallback = options.defaultAllowance ?? DEFAULT_ENDPOINT_ALLOWANCE;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const calls = new Map<string, number[]>();
  const allowances = new Map<string, number>(Object.entries(options.allowances ?? {}));
  // One queue per endpoint so concurrent callers are admitted in order.
  const queues = new Map<string, Promise<void>>();

  function prune(endpoint: string, at: number): number[] {
    const kept = (calls.get(endpoint) ?? []).filter((t) => at - t < windowMs);
    calls.set(endpoint, kept);
    return kept;
  }

  async function admit(endpoint: string): Promise<void> {
    for (;;) {
      const at = now();
      const recent = prune(endpoint, at);
      const allowance = allowances.get(endpoint) ?? fallback;
      if (recent.length < allowance) {
        recent.push(at);
        return;
      }
      await sleep(Math.max(1, windowMs - (at - (recent[0] ?? at))));
    }
  }

  return {
    acquire(endpoint) {
      const previous = queues.get(endpoint) ?? Promise.resolve();
      const turn = previous.then(() => admit(endpoint));
      queues.set(
        endpoint,
        turn.catch(() => undefined),
      );
      return turn;
    },
    inWindow(endpoint) {
      return prune(endpoint, now()).length;
    },
  };
}
