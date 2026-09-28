import { describe, expect, it } from 'vitest';

import { contentDigest, ogCacheKey } from './cache';

describe('OG cache keys', () => {
  it('are an HMAC of kind, id and version that never contains the token', async () => {
    const key = await ogCacheKey('secret', 'invite', 'BAX6XA', '1');
    expect(key).toMatch(/^og\/[0-9a-f]{64}\.png$/u);
    expect(key).not.toContain('BAX6XA');
    expect(await ogCacheKey('secret', 'invite', 'BAX6XA', '1')).toBe(key);
    expect(await ogCacheKey('secret', 'invite', 'BAX6XA', '2')).not.toBe(key);
    expect(await ogCacheKey('secret', 'referral', 'BAX6XA', '1')).not.toBe(key);
    expect(await ogCacheKey('other', 'invite', 'BAX6XA', '1')).not.toBe(key);
  });

  it('digests content deterministically', async () => {
    expect(await contentDigest({ a: 1 })).toBe(await contentDigest({ a: 1 }));
    expect(await contentDigest({ a: 1 })).not.toBe(await contentDigest({ a: 2 }));
  });
});
