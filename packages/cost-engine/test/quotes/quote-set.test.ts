import { DomainError } from '@cp/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { assertFrozen, freezeQuoteSet, replaceComponents } from '../../src/quotes/freeze';
import { createQuoteSet, isStaleComponent, type CostComponent } from '../../src/quotes/quote-set';
import { canonicalJson, quoteSetVersion } from '../../src/quotes/version-hash';
import { VOTE_KYOTO } from '../golden/design-chain.fixture';
import { PROPERTY_SUITE_OPTIONS } from '../property-budget';

describe('quote set version', () => {
  it('is stable across component order', () => {
    const reversed = [...VOTE_KYOTO].reverse();
    expect(createQuoteSet(reversed).version).toBe(createQuoteSet(VOTE_KYOTO).version);
    expect(createQuoteSet(VOTE_KYOTO).version).toMatch(/^qv_[0-9a-f]{16}$/);
  });

  it('does not change when the set is frozen', () => {
    const set = createQuoteSet(VOTE_KYOTO);
    const frozen = freezeQuoteSet(set, new Date('2027-02-02T00:00:00Z'));
    expect(frozen.version).toBe(set.version);
    expect(quoteSetVersion(frozen.components)).toBe(set.version);
  });

  it('canonical JSON ignores key order and encodes bigints', () => {
    expect(canonicalJson({ b: 1n, a: [2n] })).toBe(canonicalJson({ a: [2n], b: 1n }));
  });
});

describe('quote set version property', PROPERTY_SUITE_OPTIONS, () => {
  const mutations: ((c: CostComponent) => CostComponent)[] = [
    (c) => ({ ...c, amountMinor: (c.amountMinor ?? 0n) + 1n }),
    (c) => ({ ...c, amountMinor: null }),
    (c) => ({ ...c, currency: c.currency === 'USD' ? 'SGD' : 'USD' }),
    (c) => ({ ...c, unit: c.unit === 'person' ? 'group' : 'person' }),
    (c) => ({ ...c, seenAt: '2030-01-01T00:00:00.000Z' }),
    (c) => ({ ...c, source: c.source === 'user' ? 'estimate' : 'user' }),
    (c) => ({ ...c, origin: 'ZZZ' }),
    (c) => ({ ...c, kind: c.kind === 'fun' ? 'food' : 'fun' }),
  ];

  it('changes whenever any one field of any one component changes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: VOTE_KYOTO.length - 1 }),
        fc.integer({ min: 0, max: mutations.length - 1 }),
        (index, mutation) => {
          const changed = VOTE_KYOTO.map((c, i) =>
            i === index ? (mutations[mutation] as (c: CostComponent) => CostComponent)(c) : c,
          );
          expect(quoteSetVersion(changed)).not.toBe(quoteSetVersion(VOTE_KYOTO));
        },
      ),
    );
  });
});

describe('freeze', () => {
  const set = createQuoteSet(VOTE_KYOTO);
  const at = new Date('2027-02-02T09:00:00Z');

  it('pins every component and refuses edits', () => {
    const frozen = freezeQuoteSet(set, at);
    expect(frozen.components.every((c) => c.frozenAt === at.toISOString())).toBe(true);
    expect(() => replaceComponents(frozen, VOTE_KYOTO)).toThrow(DomainError);
    expect(freezeQuoteSet(frozen, new Date('2030-01-01T00:00:00Z')).frozenAt).toBe(
      at.toISOString(),
    );
  });

  it('lets an open set take new prices under a new version', () => {
    const next = replaceComponents(
      set,
      VOTE_KYOTO.map((c) => (c.kind === 'food' ? { ...c, amountMinor: 1n } : c)),
    );
    expect(next.version).not.toBe(set.version);
  });

  it('assertFrozen names the open sets', () => {
    expect(() => assertFrozen([set])).toThrow(
      expect.objectContaining({ code: 'STATE_INVALID' }) as Error,
    );
    expect(() => assertFrozen([freezeQuoteSet(set, at)])).not.toThrow();
  });
});

describe('validation and staleness', () => {
  it('rejects duplicate ids, negative prices and rooms without occupants', () => {
    const [first] = VOTE_KYOTO as [CostComponent];
    expect(() => createQuoteSet([first, first])).toThrow(DomainError);
    expect(() => createQuoteSet([{ ...first, amountMinor: -1n }])).toThrow(DomainError);
    expect(() => createQuoteSet([{ ...first, kind: 'stay', unit: 'room' }])).toThrow(DomainError);
  });

  it('flags a quote seen more than 72 hours ago', () => {
    const [first] = VOTE_KYOTO as [CostComponent];
    const seen = Date.parse(first.seenAt);
    expect(isStaleComponent(first, new Date(seen + 72 * 3_600_000))).toBe(false);
    expect(isStaleComponent(first, new Date(seen + 72 * 3_600_000 + 1))).toBe(true);
  });
});
