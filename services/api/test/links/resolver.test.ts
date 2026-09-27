import { createSeatToken, DomainError } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { createLinkProviderRegistry } from '../../src/links/registry';
import { joinCodeProvider } from '../../src/links/join-code-provider';
import {
  assertSeatToken,
  readClaimSource,
  type LinkResolverConfig,
} from '../../src/links/resolver';

const SECRET = 's'.repeat(32);
const config: LinkResolverConfig = { env: 'production', seatKeys: { k1: SECRET } };

function reason(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return { code: error.code, detail: error.detail };
    throw error;
  }
  return undefined;
}

describe('readClaimSource', () => {
  it('reads the link path a Play install referrer carries', () => {
    const referrer = `utm_source=critterpass&cp_link=${encodeURIComponent('/i/K7M2QX?c=wa')}`;
    expect(readClaimSource({ install_referrer: referrer }, config)).toEqual({
      via: 'referrer',
      target: { kind: 'invite', code: 'K7M2QX' },
      channel: 'wa',
    });
  });

  it('refuses an organic referrer with no link in it', () => {
    expect(
      reason(() =>
        readClaimSource({ install_referrer: 'utm_source=google-play&utm_medium=organic' }, config),
      ),
    ).toEqual({ code: 'CODE_INVALID', detail: { reason: 'referrer_without_link' } });
  });

  it('accepts a pasted link only on this environment’s hosts', () => {
    expect(readClaimSource({ pasted_url: 'https://go.critterpass.app/r/K7M2QX' }, config)).toEqual({
      via: 'paste',
      target: { kind: 'referral', code: 'K7M2QX' },
      channel: null,
    });
    for (const pasted of [
      'https://staging.critterpass.app/i/K7M2QX',
      'https://critterpass.app.evil.example/i/K7M2QX',
      '/i/K7M2QX',
      'critterpass://i/K7M2QX',
    ]) {
      expect(reason(() => readClaimSource({ pasted_url: pasted }, config))).toEqual({
        code: 'CODE_INVALID',
        detail: { reason: 'link_unrecognised' },
      });
    }
  });

  it('normalises a typed code and marks the first-open link route', () => {
    expect(readClaimSource({ join_code: 'k7m-2qx' }, config)).toMatchObject({
      via: 'code',
      target: { kind: 'invite', code: 'K7M2QX' },
    });
    expect(reason(() => readClaimSource({ join_code: 'K7M2Q0' }, config))).toMatchObject({
      code: 'CODE_INVALID',
    });
    expect(
      readClaimSource(
        { opened_url: 'https://critterpass.app/plan/0199a000-0000-7000-8000-000000000001' },
        config,
      ),
    ).toMatchObject({ via: 'link', target: { kind: 'plan' } });
    expect(readClaimSource({ phone: true }, config)).toBeNull();
  });
});

describe('assertSeatToken', () => {
  it('passes a seat minted for the code and refuses one minted for another code', async () => {
    const seat = await createSeatToken('K7M2QX', { activeKeyId: 'k1', keys: { k1: SECRET } });
    await expect(assertSeatToken({ kind: 'invite', code: 'K7M2QX', seat }, config)).resolves.toBe(
      undefined,
    );
    await expect(
      assertSeatToken({ kind: 'invite', code: 'K7M2QY', seat }, config),
    ).rejects.toMatchObject({ code: 'CODE_INVALID', detail: { reason: 'seat_unverified' } });
    await expect(
      assertSeatToken(
        { kind: 'invite', code: 'K7M2QX', seat },
        { env: 'production', seatKeys: {} },
      ),
    ).rejects.toMatchObject({ code: 'CODE_INVALID' });
  });
});

describe('link provider registry', () => {
  it('refuses a second provider for a kind or a second phone matcher', () => {
    const registry = createLinkProviderRegistry();
    registry.register(joinCodeProvider);
    expect(registry.get('referral')).toBe(joinCodeProvider);
    expect(() => registry.register({ ...joinCodeProvider, kinds: ['invite'] })).toThrow();
    registry.setPhoneMatcher(() => Promise.resolve(null));
    expect(() => registry.setPhoneMatcher(() => Promise.resolve(null))).toThrow();
  });
});
