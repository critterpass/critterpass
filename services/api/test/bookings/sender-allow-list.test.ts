import { describe, expect, it } from 'vitest';

import {
  accountOwnsAddress,
  isAppleRelay,
  normalizeSender,
} from '../../src/bookings/sender-allow-list';
import { verifySignature } from '../../src/routes/webhooks/inbound-email';
import { crypto as dbCrypto } from '@cp/db';

describe('sender addresses', () => {
  it('reads the bare, lower-cased address of a From value', () => {
    expect(normalizeSender('Maya Tan <Maya.Tan@Example.COM>')).toBe('maya.tan@example.com');
    expect(normalizeSender(' ops@agoda.com ')).toBe('ops@agoda.com');
    expect(normalizeSender('not an address')).toBeNull();
    expect(normalizeSender('Maya <maya@example>')).toBeNull();
  });

  it('accepts a verified account email, or the account’s own Apple relay address', () => {
    const account = { uid: 'u', email: 'maya@example.com', emailVerified: true };
    expect(accountOwnsAddress('maya@example.com', account)).toBe(true);
    expect(accountOwnsAddress('maya@example.com', { ...account, emailVerified: false })).toBe(
      false,
    );
    const relay = 'k7x2@privaterelay.appleid.com';
    expect(isAppleRelay(relay)).toBe(true);
    expect(accountOwnsAddress(relay, { uid: 'u', email: relay, emailVerified: false })).toBe(true);
    expect(accountOwnsAddress(relay, account)).toBe(false);
    expect(isAppleRelay('someone@privaterelay.appleid.com.evil.example')).toBe(false);
  });
});

describe('webhook signatures', () => {
  const secret = 'shared-secret-for-tests-only-0123456789';
  const now = new Date('2026-09-30T03:00:00Z');
  const ts = String(now.getTime() / 1000);
  const body = '{"local_part":"bali-six"}';
  const signed = dbCrypto.hashWithPepper(`${ts}.${body}`, secret);

  it('accepts the Worker’s signature within five minutes', () => {
    expect(verifySignature(secret, ts, signed, body, now)).toBe(true);
    expect(verifySignature(secret, ts, signed, body, new Date(now.getTime() + 299_000))).toBe(true);
  });

  it('refuses a changed body, a stale or missing timestamp, and a malformed signature', () => {
    expect(verifySignature(secret, ts, signed, `${body} `, now)).toBe(false);
    expect(verifySignature(secret, ts, signed, body, new Date(now.getTime() + 301_000))).toBe(
      false,
    );
    expect(verifySignature(secret, undefined, signed, body, now)).toBe(false);
    expect(verifySignature(secret, ts, 'zz', body, now)).toBe(false);
  });
});
