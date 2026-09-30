import { describe, expect, it } from 'vitest';

import {
  FLAG_CATALOG,
  FLAG_KEYS,
  coerceFlag,
  posthogFlagKey,
  resolveFlags,
  type FlagCatalog,
} from './index';

const TEST_CATALOG = {
  'guide.voice': { kind: 'boolean', default: false, owner: 'guide', description: 'x' },
  'invite.layout': {
    kind: 'variant',
    variants: ['control', 'prefill_first'],
    default: 'control',
    owner: 'growth',
    description: 'x',
  },
} as const satisfies FlagCatalog;

describe('flag catalog', () => {
  it('keeps every default a valid value and every variant flag defaulting to control', () => {
    for (const key of FLAG_KEYS) {
      const definition: (typeof FLAG_CATALOG)[typeof key] = FLAG_CATALOG[key];
      expect(typeof definition.default).toBe('boolean');
      expect(key).toMatch(/^[a-z]+\.[a-z_]+$/u);
    }
  });

  it('keeps session replay off by default', () => {
    expect(resolveFlags(undefined)['analytics.replay']).toBe(false);
  });

  it('falls back to defaults when PostHog is unreachable or returns junk', () => {
    expect(resolveFlags(undefined, TEST_CATALOG)).toEqual({
      'guide.voice': false,
      'invite.layout': 'control',
    });
    expect(resolveFlags({ 'guide.voice': 'yes', 'invite.layout': 'nope' }, TEST_CATALOG)).toEqual({
      'guide.voice': false,
      'invite.layout': 'control',
    });
  });

  it('passes valid values through', () => {
    expect(
      resolveFlags({ 'guide-voice': true, 'invite-layout': 'prefill_first' }, TEST_CATALOG),
    ).toEqual({ 'guide.voice': true, 'invite.layout': 'prefill_first' });
    expect(coerceFlag('invite.layout', 'prefill_first', TEST_CATALOG)).toBe('prefill_first');
  });

  it('stores every flag under a key PostHog accepts, one key per flag', () => {
    const keys = Object.keys(FLAG_CATALOG).map(posthogFlagKey);
    for (const key of keys) expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('reads PostHog values under their PostHog keys', () => {
    expect(resolveFlags({ 'money-receipts': true })['money.receipts']).toBe(true);
    expect(resolveFlags({ 'money.receipts': true })['money.receipts']).toBe(false);
  });
});
