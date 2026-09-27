/**
 * Limits return `RATE_LIMITED` with `retry_after_s`. Pure unit coverage against a fake Redis (an
 * in-memory INCR/EXPIRE/TTL implementation, not a network boundary double — the atomic-counter-
 * with-TTL logic itself is what is under test).
 */
import { describe, expect, it } from 'vitest';

import {
  checkLinkRateLimit,
  checkRateLimit,
  enforceOtpSendRateLimit,
  hashForRateLimitKey,
  LINK_PER_UID_RULE,
  type RateLimitRedisClient,
} from '../../src/abuse/rate-limits';

class FakeRedis implements RateLimitRedisClient {
  private readonly counts = new Map<string, number>();
  private readonly expiresAt = new Map<string, number>();

  async incr(key: string): Promise<number> {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    await Promise.resolve();
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.expiresAt.set(key, Date.now() + seconds * 1000);
    await Promise.resolve();
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const at = this.expiresAt.get(key);
    await Promise.resolve();
    if (!at) return -1;
    return Math.max(1, Math.ceil((at - Date.now()) / 1000));
  }
}

describe('checkRateLimit', () => {
  it('allows up to max requests within the window', async () => {
    const redis = new FakeRedis();
    const rule = { windowSeconds: 60, max: 3 };
    for (let i = 0; i < 3; i += 1) {
      const decision = await checkRateLimit(redis, 'k', rule);
      expect(decision.allowed).toBe(true);
    }
  });

  it('rejects the request past max, with a positive retry_after_s', async () => {
    const redis = new FakeRedis();
    const rule = { windowSeconds: 60, max: 2 };
    await checkRateLimit(redis, 'k', rule);
    await checkRateLimit(redis, 'k', rule);
    const decision = await checkRateLimit(redis, 'k', rule);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterS).toBeGreaterThan(0);
  });

  it('keys are independent', async () => {
    const redis = new FakeRedis();
    const rule = { windowSeconds: 60, max: 1 };
    expect((await checkRateLimit(redis, 'a', rule)).allowed).toBe(true);
    expect((await checkRateLimit(redis, 'b', rule)).allowed).toBe(true);
    expect((await checkRateLimit(redis, 'a', rule)).allowed).toBe(false);
  });
});

describe('hashForRateLimitKey', () => {
  it('is deterministic and never returns the raw input', () => {
    const hash = hashForRateLimitKey('+6598765432');
    expect(hash).not.toContain('+65');
    expect(hashForRateLimitKey('+6598765432')).toBe(hash);
    expect(hashForRateLimitKey('+6598765433')).not.toBe(hash);
  });
});

describe('enforceOtpSendRateLimit', () => {
  it('rejects the 4th send within 10 minutes for the same phone number', async () => {
    const redis = new FakeRedis();
    const input = { phoneNumber: '+6598765432', installId: undefined };
    await enforceOtpSendRateLimit(input, { redis });
    await enforceOtpSendRateLimit(input, { redis });
    await enforceOtpSendRateLimit(input, { redis });
    const error = await enforceOtpSendRateLimit(input, { redis }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ code: 'RATE_LIMITED' });
    const detail = (error as { detail: { retry_after_s: number } }).detail;
    expect(typeof detail.retry_after_s).toBe('number');
    expect(detail.retry_after_s).toBeGreaterThan(0);
  });

  it('rejects the 6th send within an hour for the same device, even across different phone numbers', async () => {
    const redis = new FakeRedis();
    const installId = 'install-1';
    for (let i = 0; i < 5; i += 1) {
      await enforceOtpSendRateLimit({ phoneNumber: `+6598765${430 + i}`, installId }, { redis });
    }
    await expect(
      enforceOtpSendRateLimit({ phoneNumber: '+6598765999', installId }, { redis }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('skips the device check entirely when no install id is provided', async () => {
    const redis = new FakeRedis();
    await expect(
      enforceOtpSendRateLimit({ phoneNumber: undefined, installId: undefined }, { redis }),
    ).resolves.toBeUndefined();
  });
});

describe('checkLinkRateLimit', () => {
  it('allows up to LINK_PER_UID_RULE.max attempts per uid then rejects', async () => {
    const redis = new FakeRedis();
    for (let i = 0; i < LINK_PER_UID_RULE.max; i += 1) {
      expect((await checkLinkRateLimit(redis, 'uid-1')).allowed).toBe(true);
    }
    expect((await checkLinkRateLimit(redis, 'uid-1')).allowed).toBe(false);
  });
});
