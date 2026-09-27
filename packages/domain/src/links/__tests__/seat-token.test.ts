import { describe, expect, it } from 'vitest';

import {
  createSeatToken,
  isSeatTokenShape,
  seatTokenKeyringFromJson,
  verifySeatToken,
} from '../seat-token';

const SECRET_A = 'a'.repeat(32);
const SECRET_B = 'b'.repeat(40);

describe('seat tokens', () => {
  it('verifies against the code it was minted for and carries 128 random bits', async () => {
    const keyring = { activeKeyId: 'k1', keys: { k1: SECRET_A } };
    const token = await createSeatToken('K7M2QX', keyring);
    expect(isSeatTokenShape(token)).toBe(true);
    expect(token.endsWith('k1')).toBe(true);
    expect(await verifySeatToken(token, 'K7M2QX', keyring.keys)).toEqual({
      status: 'ok',
      keyId: 'k1',
    });
    const other = await createSeatToken('K7M2QX', keyring);
    expect(other.slice(0, 22)).not.toBe(token.slice(0, 22));
  });

  it('rejects the token next to a different code', async () => {
    const keyring = { activeKeyId: 'k1', keys: { k1: SECRET_A } };
    const token = await createSeatToken('K7M2QX', keyring);
    expect(await verifySeatToken(token, 'K7M2QY', keyring.keys)).toEqual({
      status: 'bad_signature',
    });
  });

  it('keeps verifying tokens signed by a retired key after rotation', async () => {
    const old = await createSeatToken('K7M2QX', { activeKeyId: 'k1', keys: { k1: SECRET_A } });
    const rotated = { k1: SECRET_A, k2: SECRET_B };
    const fresh = await createSeatToken('K7M2QX', { activeKeyId: 'k2', keys: rotated });
    expect((await verifySeatToken(old, 'K7M2QX', rotated)).status).toBe('ok');
    expect(await verifySeatToken(fresh, 'K7M2QX', rotated)).toEqual({ status: 'ok', keyId: 'k2' });
    expect(await verifySeatToken(old, 'K7M2QX', { k2: SECRET_B })).toEqual({
      status: 'unknown_key',
    });
  });

  it('detects a tampered mac and malformed input', async () => {
    const keys = { k1: SECRET_A };
    const token = await createSeatToken('K7M2QX', { activeKeyId: 'k1', keys });
    const flipped = token.slice(0, 30) + (token[30] === 'A' ? 'B' : 'A') + token.slice(31);
    expect((await verifySeatToken(flipped, 'K7M2QX', keys)).status).toBe('bad_signature');
    expect((await verifySeatToken('short', 'K7M2QX', keys)).status).toBe('malformed');
    expect((await verifySeatToken(`${token.slice(0, 44)}toString`, 'K7M2QX', keys)).status).toBe(
      'malformed',
    );
    expect((await verifySeatToken(`${token.slice(0, 44)}proto`, 'K7M2QX', keys)).status).toBe(
      'unknown_key',
    );
  });

  it('loads a keyring from env JSON and refuses weak or unlisted keys', () => {
    expect(seatTokenKeyringFromJson(JSON.stringify({ k1: SECRET_A }), 'k1')).toEqual({
      activeKeyId: 'k1',
      keys: { k1: SECRET_A },
    });
    expect(() => seatTokenKeyringFromJson(JSON.stringify({ k1: 'short' }), 'k1')).toThrow();
    expect(() => seatTokenKeyringFromJson(JSON.stringify({ K1: SECRET_A }), 'K1')).toThrow();
    expect(() => seatTokenKeyringFromJson(JSON.stringify({ k1: SECRET_A }), 'k2')).toThrow();
  });
});
