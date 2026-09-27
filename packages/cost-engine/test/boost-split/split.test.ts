import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { splitBoost } from '../../src/boost-split/split';
import { money } from '../../src/money/money';
import { PROPERTY_SUITE_OPTIONS } from '../property-budget';

const members = (n: number) => Array.from({ length: n }, (_, i) => `m${i}`);

describe('splitBoost golden', () => {
  it('$12.00 over 5: four IOUs of $2.40, buyer $2.40', () => {
    const split = splitBoost(money(1_200n, 'USD'), 'm0', members(5));
    expect(split.ious.map((i) => i.amount.amountMinor)).toEqual([240n, 240n, 240n, 240n]);
    expect(split.ious.every((i) => i.creditorUid === 'm0')).toBe(true);
    expect(split.buyerShare).toEqual(money(240n, 'USD'));
  });

  it('$12.00 over 7: six IOUs of $1.71, buyer absorbs the remainder at $1.74', () => {
    const split = splitBoost(money(1_200n, 'USD'), 'm3', members(7));
    expect(split.ious).toHaveLength(6);
    expect(split.ious.every((i) => i.amount.amountMinor === 171n)).toBe(true);
    expect(split.ious.map((i) => i.debtorUid)).not.toContain('m3');
    expect(split.buyerShare).toEqual(money(174n, 'USD'));
  });

  it('rejects a buyer outside the split, duplicates and negative totals', () => {
    expect(() => splitBoost(money(1n, 'USD'), 'x', ['a'])).toThrow();
    expect(() => splitBoost(money(1n, 'USD'), 'a', ['a', 'a'])).toThrow();
    expect(() => splitBoost(money(-1n, 'USD'), 'a', ['a'])).toThrow();
    expect(splitBoost(money(1_200n, 'USD'), 'a', ['a'])).toEqual({
      ious: [],
      buyerShare: money(1_200n, 'USD'),
    });
  });
});

describe('splitBoost property', PROPERTY_SUITE_OPTIONS, () => {
  it('IOUs are equal, the buyer absorbs the remainder and everything sums to the total', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000n }),
        fc.integer({ min: 1, max: 12 }),
        (total, n) => {
          const split = splitBoost(money(total, 'USD'), 'm0', members(n));
          const owed = split.ious.reduce((s, i) => s + i.amount.amountMinor, 0n);
          expect(owed + split.buyerShare.amountMinor).toBe(total);
          const each = total / BigInt(n);
          expect(split.ious.every((i) => i.amount.amountMinor === each)).toBe(true);
          expect(split.buyerShare.amountMinor - each).toBe(total % BigInt(n));
        },
      ),
    );
  });
});
