import { describe, expect, it } from 'vitest';

import { mintAdminCliToken, verifyAdminCliToken } from './cli-token';

const secret = 'local-development-only-auth-secret-not-for-staging';
const now = new Date('2026-09-28T10:00:00Z');

describe('admin CLI token', () => {
  it('verifies its own token until it expires', async () => {
    const token = await mintAdminCliToken({ email: 'Owner@CritterPass.test', secret, now });
    expect(await verifyAdminCliToken(token, secret, now)).toMatchObject({
      email: 'owner@critterpass.test',
    });
    const later = new Date(now.getTime() + 301_000);
    expect(await verifyAdminCliToken(token, secret, later)).toBeNull();
  });

  it('refuses another secret, a tampered payload and an over-long lifetime', async () => {
    const token = await mintAdminCliToken({ email: 'owner@critterpass.test', secret, now });
    expect(await verifyAdminCliToken(token, `${secret}x`, now)).toBeNull();
    const [, sig] = token.split('.');
    const forged = `${btoa(JSON.stringify({ email: 'owner@critterpass.test', iat: 0, exp: 9e9 }))}.${sig ?? ''}`;
    expect(await verifyAdminCliToken(forged, secret, now)).toBeNull();
    const long = await mintAdminCliToken({ email: 'o@c.test', secret, now, ttlSeconds: 3600 });
    const claims = await verifyAdminCliToken(long, secret, now);
    expect((claims?.exp ?? 0) - (claims?.iat ?? 0)).toBe(300);
  });
});
