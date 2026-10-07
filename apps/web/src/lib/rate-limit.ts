/**
 * Fixed-window per-IP rate limiting for the waitlist endpoints (join and place search, each with
 * its own count), backed by a D1 counter row keyed by a hashed IP (never the raw address). Pure decision logic lives here so it is unit-testable without
 * a database; the endpoint owns reading/writing the row.
 */
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const RATE_LIMIT_MAX_REQUESTS = 5;

// Not a secret: only makes a hashed IP resistant to a precomputed lookup table, not to a targeted
// attacker who already controls the traffic they're hashing.
export const IP_HASH_SALT = 'critterpass-waitlist-rate-limit';

/**
 * Place search: enough for a person typing a few city names, far too few to walk the catalogue.
 * Counted under its own salt, so searching never uses up the join allowance. Answers served from
 * the cache are not counted.
 */
export const SEARCH_RATE_LIMIT_MAX_REQUESTS = 120;
export const SEARCH_IP_HASH_SALT = 'critterpass-waitlist-search-rate-limit';

export interface RateLimitRow {
  readonly windowStartMs: number;
  readonly count: number;
}

export interface RateLimitDecision {
  readonly limited: boolean;
  /** The row to persist: a fresh window (count 1) or the existing window with count incremented. */
  readonly next: RateLimitRow;
}

/**
 * Decides whether a request at `nowMs` should be limited given the previous window (or `null` for
 * a first-ever request from this IP), starting a new window once the previous one has elapsed.
 */
export function decideRateLimit(
  previous: RateLimitRow | null,
  nowMs: number,
  maxRequests: number = RATE_LIMIT_MAX_REQUESTS,
): RateLimitDecision {
  if (previous === null || nowMs - previous.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
    return { limited: false, next: { windowStartMs: nowMs, count: 1 } };
  }
  const count = previous.count + 1;
  return {
    limited: count > maxRequests,
    next: { windowStartMs: previous.windowStartMs, count },
  };
}

/** SHA-256 of the IP with a per-deploy salt (Web Crypto — available in both Workers and Node). */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
