import { DomainError } from '@cp/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { convert, convertViaBase } from '../../src/fx/convert';
import { money, type Money } from '../../src/money/money';
import { type FxSnapshot } from '../../src/fx/snapshot';

const EUR_SGD: FxSnapshot = {
  base: 'EUR',
  quote: 'SGD',
  rate: '1.4571000000',
  asOf: '2026-09-27',
  source: 'frankfurter',
};
const EUR_IDR: FxSnapshot = {
  base: 'EUR',
  quote: 'IDR',
  rate: '20411.0000000000',
  asOf: '2026-09-27',
  source: 'frankfurter',
};
const EUR_JPY: FxSnapshot = {
  base: 'EUR',
  quote: 'JPY',
  rate: '180.4000000000',
  asOf: '2026-09-27',
  source: 'frankfurter',
};

describe('convert: direct snapshot pair', () => {
  it('is a no-op when the target already matches, without needing the snapshot to relate anything', () => {
    const sgd = money(1_000n, 'SGD');
    const bogus: FxSnapshot = {
      base: 'XXX',
      quote: 'YYY',
      rate: '1',
      asOf: '2026-09-27',
      source: 's',
    };
    expect(convert(sgd, 'SGD', bogus)).toBe(sgd);
  });

  it('converts base -> quote by multiplying the exact rate', () => {
    // 1 EUR = 1.4571 SGD, so €100.00 (10000 minor) -> S$145.71 (14571 minor).
    const converted = convert(money(10_000n, 'EUR'), 'SGD', EUR_SGD);
    expect(converted).toEqual(money(14_571n, 'SGD'));
  });

  it('converts quote -> base by dividing (the inverse rate)', () => {
    // S$1.4571 -> exactly €1.00.
    const converted = convert(money(14_571n, 'SGD'), 'EUR', EUR_SGD);
    expect(converted).toEqual(money(10_000n, 'EUR'));
  });

  it('adjusts for differing ISO exponents (EUR, 2 decimals -> JPY, 0 decimals)', () => {
    // 1 EUR = 180.4 JPY, so €10.00 (1000 minor) -> ¥1804 (1804 minor, JPY has no fractional unit).
    const converted = convert(money(1_000n, 'EUR'), 'JPY', EUR_JPY);
    expect(converted).toEqual(money(1_804n, 'JPY'));
  });

  it('rounds per the requested mode when the exact result is not an integer minor amount', () => {
    // 1 EUR = 1.4571 SGD; €0.01 (1 minor) -> 0.014571 SGD -> rounds to 1 or 2 cents by mode.
    expect(convert(money(1n, 'EUR'), 'SGD', EUR_SGD, 'down')).toEqual(money(1n, 'SGD'));
    expect(convert(money(1n, 'EUR'), 'SGD', EUR_SGD, 'up')).toEqual(money(2n, 'SGD'));
  });

  it('throws when the snapshot does not relate the two currencies', () => {
    expect(() => convert(money(100n, 'SGD'), 'JPY', EUR_SGD)).toThrow(DomainError);
  });

  it('throws on a malformed rate string rather than silently misreading it', () => {
    const bad: FxSnapshot = {
      base: 'EUR',
      quote: 'SGD',
      rate: 'not-a-number',
      asOf: '2026-09-27',
      source: 's',
    };
    expect(() => convert(money(100n, 'EUR'), 'SGD', bad)).toThrow(DomainError);
  });
});

describe('convertViaBase: cross rate through a shared base (docs/product-decisions.md FX rule)', () => {
  it('is a no-op when the target already matches', () => {
    const idr = money(1_000_000n, 'IDR');
    expect(convertViaBase(idr, 'IDR', EUR_IDR, EUR_IDR)).toBe(idr);
  });

  it('matches fixture math to the minor unit for SGD -> IDR', () => {
    // 1 SGD = 20411/1.4571 IDR; S$1.00 (100 minor) -> hand-computed IDR minor units below, rounded
    // half_even (remainder 1,484 / 14,571 is under half, so it rounds down).
    const sgdToIdr = convertViaBase(money(100n, 'SGD'), 'IDR', EUR_SGD, EUR_IDR, 'half_even');
    expect(sgdToIdr).toEqual(money(1_400_796n, 'IDR'));
  });

  it('round-trips SGD -> IDR -> JPY -> SGD within a few minor units (rounding only, no drift)', () => {
    const sgdToIdr = convertViaBase(money(100n, 'SGD'), 'IDR', EUR_SGD, EUR_IDR, 'half_even');
    const idrToJpy = convertViaBase(sgdToIdr, 'JPY', EUR_IDR, EUR_JPY, 'half_even');
    const jpyToSgd = convertViaBase(idrToJpy, 'SGD', EUR_JPY, EUR_SGD, 'half_even');
    const diff = jpyToSgd.amountMinor - 100n;
    expect(diff < 0n ? -diff : diff).toBeLessThanOrEqual(3n);
  });

  it('throws when the two snapshots do not share a base currency', () => {
    const wrongBase: FxSnapshot = { ...EUR_IDR, base: 'USD' };
    expect(() => convertViaBase(money(100n, 'SGD'), 'IDR', EUR_SGD, wrongBase)).toThrow(
      DomainError,
    );
  });

  it('throws when the source snapshot does not quote the money currency', () => {
    expect(() => convertViaBase(money(100n, 'JPY'), 'IDR', EUR_SGD, EUR_IDR)).toThrow(DomainError);
  });

  it('throws when the target snapshot does not quote the requested target', () => {
    expect(() => convertViaBase(money(100n, 'SGD'), 'JPY', EUR_SGD, EUR_IDR)).toThrow(DomainError);
  });
});

describe('property: conversion never uses a float and round-trips within one minor unit (10k cases)', () => {
  it('convert then convert back (inverse direction) stays within 1 minor unit of the original', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_00n }),
        fc.integer({ min: 1, max: 999_999 }),
        fc.integer({ min: 1, max: 9 }),
        (amountMinor, rateWhole, rateFraction) => {
          const snapshot: FxSnapshot = {
            base: 'EUR',
            quote: 'SGD',
            rate: `${rateWhole}.${rateFraction}`,
            asOf: '2026-09-27',
            source: 'property',
          };
          const original: Money = { amountMinor, currency: 'EUR' };
          const there = convert(original, 'SGD', snapshot, 'half_even');
          const back = convert(there, 'EUR', snapshot, 'half_even');
          const diff = back.amountMinor - amountMinor;
          return (diff < 0n ? -diff : diff) <= 1n;
        },
      ),
      { numRuns: 10_000 },
    );
  });
});
