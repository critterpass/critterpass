import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  base64UrlValuesMatch,
  decryptField,
  encryptField,
  hashesMatch,
  hashWithPepper,
  parseFieldEncryptionKeys,
  reencryptField,
  type FieldEncryptionKeyring,
} from '../src/crypto';

function keyring(activeKeyId = 'k1', extra: Record<string, Buffer> = {}): FieldEncryptionKeyring {
  return {
    activeKeyId,
    keys: { k1: randomBytes(32), k2: randomBytes(32), ...extra },
  };
}

describe('field encryption envelope', () => {
  it('round-trips a plaintext value under the active key', () => {
    const ring = keyring();
    const stored = encryptField('+842812345678', ring);
    expect(stored.startsWith('v1:k1:')).toBe(true);
    expect(decryptField(stored, ring)).toBe('+842812345678');
  });

  it('produces a different ciphertext each call (random IV)', () => {
    const ring = keyring();
    const a = encryptField('same-value', ring);
    const b = encryptField('same-value', ring);
    expect(a).not.toBe(b);
  });

  it('rejects a tampered ciphertext (auth tag mismatch)', () => {
    const ring = keyring();
    const stored = encryptField('secret', ring);
    const parts = stored.split(':');
    // Flip the last character of the ciphertext segment.
    const tampered = [
      ...parts.slice(0, 4),
      parts[4]!.slice(0, -1) + (parts[4]!.endsWith('A') ? 'B' : 'A'),
    ].join(':');
    expect(() => decryptField(tampered, keyring())).toThrow();
    expect(() => decryptField(tampered, { ...ring })).toThrow();
    void stored;
  });

  it('rejects an unknown key id', () => {
    const ring = keyring();
    const stored = encryptField('value', ring);
    const ringWithoutK1: FieldEncryptionKeyring = {
      activeKeyId: 'k2',
      keys: { k2: randomBytes(32) },
    };
    expect(() => decryptField(stored, ringWithoutK1)).toThrow(/no field encryption key/);
  });

  it('rejects a malformed envelope', () => {
    expect(() => decryptField('not-an-envelope', keyring())).toThrow(/malformed/);
  });

  it('re-encrypts an old-key value under the new active key (rotation)', () => {
    const oldRing = keyring('k1');
    const stored = encryptField('rotate-me', oldRing);
    const newRing: FieldEncryptionKeyring = { activeKeyId: 'k2', keys: oldRing.keys };
    const rotated = reencryptField(stored, newRing);
    expect(rotated.startsWith('v1:k2:')).toBe(true);
    expect(decryptField(rotated, newRing)).toBe('rotate-me');
  });

  it('parses the env-format key list', () => {
    const keys = parseFieldEncryptionKeys(
      `k1:${Buffer.alloc(32, 1).toString('base64')},k2:${Buffer.alloc(32, 2).toString('base64')}`,
    );
    expect(Object.keys(keys).sort()).toEqual(['k1', 'k2']);
    expect(keys['k1']).toHaveLength(32);
  });

  it('rejects a malformed key list entry', () => {
    expect(() => parseFieldEncryptionKeys('not-a-pair')).toThrow(/invalid field encryption key/);
  });
});

describe('peppered hash', () => {
  it('is deterministic for the same value and pepper', () => {
    expect(hashWithPepper('+841234567890', 'pepper')).toBe(
      hashWithPepper('+841234567890', 'pepper'),
    );
  });

  it('differs across peppers', () => {
    expect(hashWithPepper('value', 'pepper-a')).not.toBe(hashWithPepper('value', 'pepper-b'));
  });

  it('matches identical hex hashes in constant time and rejects different ones', () => {
    const hash = hashWithPepper('value', 'pepper');
    expect(hashesMatch(hash, hash)).toBe(true);
    expect(hashesMatch(hash, hashWithPepper('other', 'pepper'))).toBe(false);
    expect(hashesMatch(hash, 'ab')).toBe(false);
  });

  it('compares base64url values in constant time', () => {
    const a = Buffer.from('signature-bytes').toString('base64url');
    expect(base64UrlValuesMatch(a, a)).toBe(true);
    expect(base64UrlValuesMatch(a, Buffer.from('other-bytes-here').toString('base64url'))).toBe(
      false,
    );
  });
});
