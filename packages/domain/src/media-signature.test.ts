import { describe, expect, it } from 'vitest';

import { signMediaUrl, verifyMediaSignature } from './media-signature';

const KEY_ID = 'kid-2026-01';
const SECRET = 'unit-test-signing-secret';
const KEYS = { [KEY_ID]: SECRET };
const BASE_URL = 'https://media.critterpass.app';
const OBJECT_KEY = 'trips/42/cover.webp';
const VARIANT = 'thumb';

interface SignedQuery {
  readonly objectKey: string;
  readonly variant: string;
  readonly exp: number;
  readonly kid: string;
  readonly sig: string;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function sign(): Promise<{ query: SignedQuery }> {
  const expiresAt = nowSeconds() + 300;
  const url = await signMediaUrl({
    baseUrl: BASE_URL,
    objectKey: OBJECT_KEY,
    variant: VARIANT,
    expiresAt,
    keyId: KEY_ID,
    secret: SECRET,
  });
  const parsed = new URL(url);
  return {
    query: {
      objectKey: OBJECT_KEY,
      variant: parsed.searchParams.get('v') ?? '',
      exp: Number(parsed.searchParams.get('exp')),
      kid: parsed.searchParams.get('kid') ?? '',
      sig: parsed.searchParams.get('sig') ?? '',
    },
  };
}

describe('signMediaUrl', () => {
  it('builds the documented URL shape', async () => {
    const expiresAt = 1_800_000_000;
    const url = await signMediaUrl({
      baseUrl: BASE_URL,
      objectKey: OBJECT_KEY,
      variant: VARIANT,
      expiresAt,
      keyId: KEY_ID,
      secret: SECRET,
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(`${BASE_URL}/${OBJECT_KEY}`);
    expect(parsed.searchParams.get('v')).toBe(VARIANT);
    expect(parsed.searchParams.get('exp')).toBe(String(expiresAt));
    expect(parsed.searchParams.get('kid')).toBe(KEY_ID);
    expect(parsed.searchParams.get('sig')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('percent-encodes each object key segment without escaping slashes', async () => {
    const url = await signMediaUrl({
      baseUrl: BASE_URL,
      objectKey: 'trips/42/cover art.webp',
      variant: VARIANT,
      expiresAt: 1_800_000_000,
      keyId: KEY_ID,
      secret: SECRET,
    });
    expect(new URL(url).pathname).toBe('/trips/42/cover%20art.webp');
  });

  it('rejects an empty objectKey', async () => {
    await expect(
      signMediaUrl({
        baseUrl: BASE_URL,
        objectKey: '',
        variant: VARIANT,
        expiresAt: 1_800_000_000,
        keyId: KEY_ID,
        secret: SECRET,
      }),
    ).rejects.toThrow(/objectKey/);
  });
});

describe('verifyMediaSignature round trip', () => {
  it('accepts a signature produced by signMediaUrl', async () => {
    const { query } = await sign();
    const result = await verifyMediaSignature({ ...query, keys: KEYS, now: nowSeconds() });
    expect(result).toEqual({ status: 'ok' });
  });

  it('rejects a tampered object key', async () => {
    const { query } = await sign();
    const result = await verifyMediaSignature({
      ...query,
      objectKey: `${query.objectKey}-tampered`,
      keys: KEYS,
      now: nowSeconds(),
    });
    expect(result).toEqual({ status: 'bad_signature' });
  });

  it('rejects a tampered variant', async () => {
    const { query } = await sign();
    const result = await verifyMediaSignature({
      ...query,
      variant: 'original',
      keys: KEYS,
      now: nowSeconds(),
    });
    expect(result).toEqual({ status: 'bad_signature' });
  });

  it('rejects a tampered exp', async () => {
    const { query } = await sign();
    const result = await verifyMediaSignature({
      ...query,
      exp: query.exp + 3600,
      keys: KEYS,
      now: nowSeconds(),
    });
    expect(result).toEqual({ status: 'bad_signature' });
  });

  it('rejects a tampered kid even when the substituted key id is known', async () => {
    const { query } = await sign();
    const otherKeys = { ...KEYS, 'kid-2026-02': 'another-secret' };
    const result = await verifyMediaSignature({
      ...query,
      kid: 'kid-2026-02',
      keys: otherKeys,
      now: nowSeconds(),
    });
    expect(result).toEqual({ status: 'bad_signature' });
  });

  it('rejects a signature with a flipped character', async () => {
    const { query } = await sign();
    const flipped =
      query.sig.charAt(0) === 'A' ? `B${query.sig.slice(1)}` : `A${query.sig.slice(1)}`;
    const result = await verifyMediaSignature({
      ...query,
      sig: flipped,
      keys: KEYS,
      now: nowSeconds(),
    });
    expect(result).toEqual({ status: 'bad_signature' });
  });

  it('rejects a non-canonical encoding of a valid signature', async () => {
    const { query } = await sign();
    // A 32-byte HMAC is 43 base64url characters; the last one carries 2 signature bits and 4 zero
    // padding bits. Setting a padding bit decodes to the same bytes but is not the canonical string.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = alphabet.indexOf(query.sig.charAt(query.sig.length - 1));
    const nonCanonical = `${query.sig.slice(0, -1)}${alphabet.charAt(last | 1)}`;
    const result = await verifyMediaSignature({
      ...query,
      sig: nonCanonical,
      keys: KEYS,
      now: nowSeconds(),
    });
    expect(result).toEqual({ status: 'malformed', reason: 'sig is not canonical base64url' });
  });

  it('accepts a signature exactly at the expiry boundary', async () => {
    const { query } = await sign();
    const result = await verifyMediaSignature({ ...query, keys: KEYS, now: query.exp });
    expect(result).toEqual({ status: 'ok' });
  });

  it('rejects a signature one second past the expiry boundary', async () => {
    const { query } = await sign();
    const result = await verifyMediaSignature({ ...query, keys: KEYS, now: query.exp + 1 });
    expect(result).toEqual({ status: 'expired' });
  });

  it('rejects an unknown key id', async () => {
    const { query } = await sign();
    const result = await verifyMediaSignature({
      ...query,
      kid: 'kid-does-not-exist',
      keys: KEYS,
      now: nowSeconds(),
    });
    expect(result).toEqual({ status: 'unknown_key' });
  });

  it('reports a malformed signature instead of throwing', async () => {
    const { query } = await sign();
    const result = await verifyMediaSignature({
      ...query,
      sig: 'not-valid-base64url!!',
      keys: KEYS,
      now: nowSeconds(),
    });
    expect(result.status).toBe('malformed');
  });

  it('reports malformed for a non-integer exp', async () => {
    const { query } = await sign();
    const result = await verifyMediaSignature({
      ...query,
      exp: Number.NaN,
      keys: KEYS,
      now: nowSeconds(),
    });
    expect(result.status).toBe('malformed');
  });

  it('reports malformed when required fields are empty', async () => {
    const result = await verifyMediaSignature({
      objectKey: '',
      variant: VARIANT,
      exp: nowSeconds() + 60,
      kid: KEY_ID,
      sig: 'x'.repeat(43),
      keys: KEYS,
      now: nowSeconds(),
    });
    expect(result.status).toBe('malformed');
  });
});
