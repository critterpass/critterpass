/**
 * A consecutive-failure circuit breaker. After `failureThreshold` router-down failures in a row
 * the circuit opens and calls fail at once for `cooldownMs`; then one trial call is let through
 * (half-open). A success closes the circuit; a failed trial opens it for another cooldown.
 */
export interface CircuitBreakerOptions {
  readonly failureThreshold?: number;
  readonly cooldownMs?: number;
  readonly now?: () => number;
}

export interface CircuitBreaker {
  /** False while open: the caller must not reach the router. */
  allow(): boolean;
  success(): void;
  failure(): void;
  readonly state: 'closed' | 'open' | 'half_open';
}

export function createCircuitBreaker(options: CircuitBreakerOptions = {}): CircuitBreaker {
  const threshold = options.failureThreshold ?? 5;
  const cooldownMs = options.cooldownMs ?? 30_000;
  const now = options.now ?? Date.now;
  let failures = 0;
  let openedAt: number | null = null;
  let trialInFlight = false;

  function currentState(): CircuitBreaker['state'] {
    if (openedAt === null) return 'closed';
    return now() - openedAt >= cooldownMs ? 'half_open' : 'open';
  }

  return {
    allow() {
      const state = currentState();
      if (state === 'closed') return true;
      if (state === 'open' || trialInFlight) return false;
      trialInFlight = true;
      return true;
    },
    success() {
      failures = 0;
      openedAt = null;
      trialInFlight = false;
    },
    failure() {
      failures += 1;
      if (trialInFlight || failures >= threshold) openedAt = now();
      trialInFlight = false;
    },
    get state() {
      return currentState();
    },
  };
}
