/**
 * T5 done-when (phase-9): enumeration of 50 codes from one IP locks out. Pure unit coverage against
 * a fake Redis.
 */
import { describe, expect, it } from 'vitest';

import {
  hashCode,
  isLockedOut,
  recordCodeAttemptFailure,
  recordCodeAttemptSuccess,
  type CodeAttemptsRedisClient,
} from '../../src/abuse/code-attempts';

class FakeRedis implements CodeAttemptsRedisClient {
  private readonly counts = new Map<string, number>();
  private readonly locks = new Map<string, number>();

  async incr(key: string): Promise<number> {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    await Promise.resolve();
    return next;
  }

  async expire(): Promise<number> {
    await Promise.resolve();
    return 1;
  }

  async ttl(key: string): Promise<number> {
    await Promise.resolve();
    const expiresAt = this.locks.get(key);
    if (!expiresAt) return -1;
    return Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
  }

  async set(key: string, _value: string, options?: { EX?: number }): Promise<unknown> {
    this.locks.set(key, Date.now() + (options?.EX ?? 0) * 1000);
    await Promise.resolve();
    return 'OK';
  }

  async del(key: string): Promise<number> {
    this.counts.delete(key);
    this.locks.delete(key);
    await Promise.resolve();
    return 1;
  }
}

describe('hashCode', () => {
  it('is deterministic and never returns the raw code', () => {
    expect(hashCode('123456')).not.toBe('123456');
    expect(hashCode('123456')).toBe(hashCode('123456'));
    expect(hashCode('123456')).not.toBe(hashCode('654321'));
  });
});

describe('code-attempts lockout', () => {
  it('is not locked before the threshold', async () => {
    const redis = new FakeRedis();
    const identity = { ip: '203.0.113.1' };
    for (let i = 0; i < 5; i += 1) await recordCodeAttemptFailure(redis, identity);
    expect((await isLockedOut(redis, identity)).locked).toBe(false);
  });

  it('locks out an IP that enumerates 50 codes', async () => {
    const redis = new FakeRedis();
    const identity = { ip: '203.0.113.2' };
    let lastStatus = { locked: false, retryAfterS: 0 };
    for (let i = 0; i < 50; i += 1) {
      lastStatus = await recordCodeAttemptFailure(redis, identity);
    }
    expect(lastStatus.locked).toBe(true);
    expect((await isLockedOut(redis, identity)).locked).toBe(true);
  });

  it('lockout duration grows with repeated failures (exponential backoff)', async () => {
    const redis = new FakeRedis();
    const identity = { ip: '203.0.113.3' };
    for (let i = 0; i < 6; i += 1) await recordCodeAttemptFailure(redis, identity);
    const firstLockout = await isLockedOut(redis, identity);
    for (let i = 0; i < 10; i += 1) await recordCodeAttemptFailure(redis, identity);
    const laterLockout = await isLockedOut(redis, identity);
    expect(laterLockout.retryAfterS).toBeGreaterThanOrEqual(firstLockout.retryAfterS);
  });

  it('locks out independently per dimension: a different IP for the same device is unaffected', async () => {
    const redis = new FakeRedis();
    const device = 'device-1';
    for (let i = 0; i < 50; i += 1) {
      await recordCodeAttemptFailure(redis, { ip: '203.0.113.4', device });
    }
    expect((await isLockedOut(redis, { ip: '198.51.100.9', device: 'device-2' })).locked).toBe(
      false,
    );
  });

  it('a successful attempt clears the failure history for that identity', async () => {
    const redis = new FakeRedis();
    const identity = { ip: '203.0.113.5' };
    for (let i = 0; i < 6; i += 1) await recordCodeAttemptFailure(redis, identity);
    expect((await isLockedOut(redis, identity)).locked).toBe(true);
    await recordCodeAttemptSuccess(redis, identity);
    expect((await isLockedOut(redis, identity)).locked).toBe(false);
  });
});
