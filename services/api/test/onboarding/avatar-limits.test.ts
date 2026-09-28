/**
 * Avatar upload limits: 5 an hour and 20 a day per uid and device, anonymous uids included, each
 * refusal a `RATE_LIMITED` with the seconds until the window resets. Counted in an in-memory stand-in
 * for Redis's INCR/EXPIRE/TTL (the same contract services/api/test/abuse/rate-limits.test.ts uses);
 * the presign route is exercised against real Redis in commands.db.test.ts.
 */
import { DomainError } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import type { RateLimitRedisClient } from '../../src/abuse/rate-limits';
import { enforceAvatarUploadLimit } from '../../src/commands/avatar/upload-limits';

class ClockedRedis implements RateLimitRedisClient {
  now = 0;
  private readonly counts = new Map<string, { value: number; expiresAt: number | null }>();

  private live(key: string) {
    const entry = this.counts.get(key);
    if (entry?.expiresAt != null && entry.expiresAt <= this.now) this.counts.delete(key);
    return this.counts.get(key);
  }

  incr(key: string): Promise<number> {
    const entry = this.live(key) ?? { value: 0, expiresAt: null };
    entry.value += 1;
    this.counts.set(key, entry);
    return Promise.resolve(entry.value);
  }

  expire(key: string, seconds: number): Promise<number> {
    const entry = this.live(key);
    if (entry) entry.expiresAt = this.now + seconds * 1000;
    return Promise.resolve(entry ? 1 : 0);
  }

  ttl(key: string): Promise<number> {
    const entry = this.live(key);
    if (!entry) return Promise.resolve(-2);
    if (entry.expiresAt === null) return Promise.resolve(-1);
    return Promise.resolve(Math.ceil((entry.expiresAt - this.now) / 1000));
  }
}

const UID = '0192a6f0-1111-7000-8000-000000000001';

async function uploads(redis: ClockedRedis, count: number, device = 'install-a'): Promise<void> {
  for (let i = 0; i < count; i += 1) await enforceAvatarUploadLimit(redis, UID, device);
}

async function refusal(redis: ClockedRedis, device = 'install-a'): Promise<DomainError> {
  const error = await enforceAvatarUploadLimit(redis, UID, device).catch((e: unknown) => e);
  if (!(error instanceof DomainError)) throw new Error('expected a refusal');
  return error;
}

describe('enforceAvatarUploadLimit', () => {
  it('refuses the sixth upload in an hour with the time left', async () => {
    const redis = new ClockedRedis();
    await uploads(redis, 5);
    redis.now = 10 * 60_000;
    const error = await refusal(redis);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.detail).toEqual({ retry_after_s: 3000, limit: 'avatar_uploads_hour' });
  });

  it('counts each device on its own', async () => {
    const redis = new ClockedRedis();
    await uploads(redis, 5, 'install-a');
    await expect(uploads(redis, 5, 'install-b')).resolves.toBeUndefined();
    await expect(refusal(redis, 'install-b')).resolves.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('puts requests without a usable install id in one shared bucket', async () => {
    const redis = new ClockedRedis();
    await enforceAvatarUploadLimit(redis, UID, undefined);
    await enforceAvatarUploadLimit(redis, UID, null);
    await uploads(redis, 3, 'not an install id!');
    await expect(enforceAvatarUploadLimit(redis, UID, undefined)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('allows five more after the hour, up to twenty in a day', async () => {
    const redis = new ClockedRedis();
    for (let hour = 0; hour < 4; hour += 1) {
      redis.now = hour * 3_600_000 + 1;
      await uploads(redis, 5);
    }
    redis.now = 4 * 3_600_000 + 1;
    const error = await refusal(redis);
    expect(error.detail).toMatchObject({ limit: 'avatar_uploads_day' });
    expect(error.detail).toMatchObject({ retry_after_s: 86_400 - 4 * 3600 });
  });
});
