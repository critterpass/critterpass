import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type FxSnapshot } from '../../src/fx/snapshot';
import { type CurrencyCode } from '../../src/money/currencies';
import { type CostComponent } from '../../src/quotes/quote-set';
import { computeShares, shareOf } from '../../src/shares/allocate';
import { convertWith, inViewerCurrency, type FxContext } from '../../src/shares/fx';
import { resolveOrigins } from '../../src/shares/per-origin';
import { CREW, DEV, JORDAN, RIN, SEEN_AT, USD } from '../golden/design-chain.fixture';
import { PROPERTY_SUITE_OPTIONS } from '../property-budget';

const base = { currency: 'USD' as const, source: 'estimate' as const, seenAt: SEEN_AT };

const FX: FxContext = {
  snapshotId: 'fx-2027-02-01',
  snapshots: [
    { base: 'EUR', quote: 'USD', rate: '1.0800000000', asOf: '2027-02-01', source: 'frankfurter' },
    { base: 'EUR', quote: 'SGD', rate: '1.4500000000', asOf: '2027-02-01', source: 'frankfurter' },
    {
      base: 'EUR',
      quote: 'JPY',
      rate: '162.0000000000',
      asOf: '2027-02-01',
      source: 'frankfurter',
    },
  ] satisfies FxSnapshot[],
};

describe('computeShares', () => {
  it('splits a group total by largest remainder, extra cents to the lowest uids', () => {
    const calc = computeShares({
      currency: USD,
      members: CREW,
      components: [{ ...base, id: 'g', kind: 'stay', unit: 'group', amountMinor: 100_001n }],
    });
    if (calc.status !== 'ok') throw new Error('expected shares');
    // 100001 / 6 = 16666 r 5: the five lowest uids (alex, dev, jordan, maya, rin) get 16667.
    expect(Object.fromEntries(calc.members.map((m) => [m.uid, m.totalMinor]))).toEqual({
      'u-winston': 16_666n,
      'u-maya': 16_667n,
      'u-alex': 16_667n,
      'u-rin': 16_667n,
      'u-jordan': 16_667n,
      'u-dev': 16_667n,
    });
    expect(calc.totalMinor).toBe(100_001n);
  });

  it('prices flights per origin and estimates a missing origin from the majority', () => {
    const members = CREW.map((m) => (m.uid === DEV ? { ...m, origin: null } : m));
    const calc = computeShares({
      currency: USD,
      members,
      components: [
        { ...base, id: 'sin', kind: 'flight', unit: 'person', origin: 'SIN', amountMinor: 500n },
        { ...base, id: 'hkg', kind: 'flight', unit: 'person', origin: 'HKG', amountMinor: 300n },
      ],
    });
    expect(shareOf(calc, DEV)).toMatchObject({ totalMinor: 500n, estimatedOrigin: true });
    expect(shareOf(calc, JORDAN)).toMatchObject({ totalMinor: 300n, estimatedOrigin: false });
  });

  it('flags a missing fare and a member with no fare for their origin', () => {
    const calc = computeShares({
      currency: USD,
      members: CREW,
      components: [
        { ...base, id: 'sin', kind: 'flight', unit: 'person', origin: 'SIN', amountMinor: null },
        { ...base, id: 'hkg', kind: 'flight', unit: 'person', origin: 'HKG', amountMinor: 300n },
      ],
    });
    expect(shareOf(calc, RIN)).toMatchObject({ totalMinor: 0n, missing: true });
    expect(shareOf(calc, JORDAN)).toMatchObject({ missing: false });
    expect(shareOf(calc, DEV)).toMatchObject({ missing: true });
  });

  it('flags stale quotes and lists components nobody pays for', () => {
    const calc = computeShares({
      currency: USD,
      members: CREW,
      now: new Date(Date.parse(SEEN_AT) + 73 * 3_600_000),
      components: [
        { ...base, id: 'lhr', kind: 'flight', unit: 'person', origin: 'LHR', amountMinor: 1n },
        { ...base, id: 'food', kind: 'food', unit: 'person', amountMinor: 1n },
      ],
    });
    if (calc.status !== 'ok') throw new Error('expected shares');
    expect(calc.unassigned).toEqual(['lhr']);
    expect(calc.members.every((m) => m.stale)).toBe(true);
  });

  it('returns a typed zero-participant result', () => {
    expect(computeShares({ currency: USD, members: [], components: [] })).toEqual({
      status: 'no_participants',
      currency: USD,
      fxSnapshotId: null,
    });
  });

  it('converts foreign components with one FX snapshot run, recorded on the calc', () => {
    const calc = computeShares({
      currency: USD,
      members: CREW.slice(0, 2),
      fx: FX,
      components: [
        { ...base, id: 'jpy', kind: 'fun', unit: 'group', currency: 'JPY', amountMinor: 16_200n },
      ],
    });
    // ¥16,200 = €100 = $108.00, split two ways.
    expect(calc).toMatchObject({ fxSnapshotId: 'fx-2027-02-01', totalMinor: 10_800n });
  });

  it('shows a share in the viewer home currency with the snapshot it used', () => {
    const shown = inViewerCurrency({ amountMinor: 10_800n, currency: USD }, 'SGD', FX);
    expect(shown).toEqual({
      amount: { amountMinor: 14_500n, currency: 'SGD' },
      fxSnapshotId: 'fx-2027-02-01',
    });
    expect(() => convertWith({ amountMinor: 1n, currency: 'USD' }, 'VND', FX)).toThrow();
    expect(() => convertWith({ amountMinor: 1n, currency: 'USD' }, 'SGD', undefined)).toThrow();
  });

  it('resolves no origin at all when nobody has one', () => {
    expect(resolveOrigins([{ uid: 'a', origin: null }])).toEqual([
      { uid: 'a', origin: null, estimatedOrigin: false },
    ]);
  });
});

const currencies: CurrencyCode[] = ['USD', 'SGD', 'JPY'];

const componentArb = (uids: readonly string[]) =>
  fc.record({
    unit: fc.constantFrom('person' as const, 'room' as const, 'group' as const),
    amountMinor: fc.bigInt({ min: 0n, max: 5_000_000n }),
    currency: fc.constantFrom(...currencies),
    members: fc.subarray([...uids], { minLength: 1 }),
  });

describe('share sums property', PROPERTY_SUITE_OPTIONS, () => {
  it('Σ shares equals Σ converted component totals, in minor units, for random inputs', () => {
    const uids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: uids.length }),
        fc.array(componentArb(uids), { maxLength: 12 }),
        (memberCount, raw) => {
          const members = uids.slice(0, memberCount).map((uid) => ({ uid, origin: null }));
          const components: CostComponent[] = raw.map((c, i) => ({
            ...base,
            id: `c${i}`,
            kind: 'fun',
            unit: c.unit,
            amountMinor: c.amountMinor,
            currency: c.currency,
            memberIds: c.members,
          }));
          const calc = computeShares({ currency: USD, members, components, fx: FX });
          if (calc.status !== 'ok') throw new Error('expected shares');
          let expected = 0n;
          for (const c of components) {
            const payers = (c.memberIds ?? []).filter((uid) => members.some((m) => m.uid === uid));
            if (payers.length === 0) continue;
            const converted = convertWith(
              { amountMinor: c.amountMinor ?? 0n, currency: c.currency },
              USD,
              FX,
            ).amountMinor;
            expected += c.unit === 'person' ? converted * BigInt(payers.length) : converted;
          }
          expect(calc.totalMinor).toBe(expected);
          expect(calc.members.reduce((s, m) => s + m.totalMinor, 0n)).toBe(expected);
        },
      ),
    );
  });
});
