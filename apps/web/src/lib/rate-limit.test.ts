import { describe, expect, it } from 'vitest';

import {
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  decideRateLimit,
  hashIp,
} from './rate-limit';

describe('decideRateLimit', () => {
  it('starts a fresh window for a first-ever request', () => {
    const decision = decideRateLimit(null, 1000);
    expect(decision.limited).toBe(false);
    expect(decision.next).toEqual({ windowStartMs: 1000, count: 1 });
  });

  it('allows requests within the max for the current window', () => {
    const previous = { windowStartMs: 1000, count: RATE_LIMIT_MAX_REQUESTS - 1 };
    const decision = decideRateLimit(previous, 1500);
    expect(decision.limited).toBe(false);
    expect(decision.next.count).toBe(RATE_LIMIT_MAX_REQUESTS);
  });

  it('limits once the count exceeds the max within the window', () => {
    const previous = { windowStartMs: 1000, count: RATE_LIMIT_MAX_REQUESTS };
    const decision = decideRateLimit(previous, 1500);
    expect(decision.limited).toBe(true);
    expect(decision.next.count).toBe(RATE_LIMIT_MAX_REQUESTS + 1);
  });

  it('starts a new window once the previous one has elapsed', () => {
    const previous = { windowStartMs: 1000, count: RATE_LIMIT_MAX_REQUESTS + 10 };
    const decision = decideRateLimit(previous, 1000 + RATE_LIMIT_WINDOW_MS);
    expect(decision.limited).toBe(false);
    expect(decision.next).toEqual({ windowStartMs: 1000 + RATE_LIMIT_WINDOW_MS, count: 1 });
  });
});

describe('hashIp', () => {
  it('is deterministic for the same input and salt', async () => {
    const a = await hashIp('203.0.113.4', 'salt');
    const b = await hashIp('203.0.113.4', 'salt');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs across IPs and across salts', async () => {
    const byIp = await hashIp('203.0.113.5', 'salt');
    const bySalt = await hashIp('203.0.113.4', 'other-salt');
    const original = await hashIp('203.0.113.4', 'salt');
    expect(byIp).not.toBe(original);
    expect(bySalt).not.toBe(original);
  });
});
