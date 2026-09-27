import { DomainError } from '@cp/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  currencyExponent,
  currencySymbol,
  DISPLAY_DECIMAL_OVERRIDES,
  displayDecimals,
  isKnownCurrency,
} from '../../src/money/currencies';
import {
  add,
  compare,
  equalsMoney,
  isNegative,
  isZero,
  money,
  multiplyByRational,
  negate,
  subtract,
  sumMoney,
  zero,
} from '../../src/money/money';
import { PROPERTY_SUITE_OPTIONS } from '../property-budget';

describe('money construction', () => {
  it('accepts a known ISO currency code', () => {
    expect(money(1_000n, 'SGD')).toEqual({ amountMinor: 1_000n, currency: 'SGD' });
  });

  it('throws a typed VALIDATION error for an unknown currency code', () => {
    expect(() => money(1_000n, 'ZZZ')).toThrow(DomainError);
    let caught: unknown;
    try {
      money(1_000n, 'ZZZ');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DomainError);
    expect((caught as DomainError).code).toBe('VALIDATION');
  });

  it('never falls back to a 2-decimal default for a zero/three-decimal currency', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('VND')).toBe(0);
    expect(currencyExponent('KRW')).toBe(0);
    expect(currencyExponent('ISK')).toBe(0);
    expect(currencyExponent('BHD')).toBe(3);
    expect(currencyExponent('KWD')).toBe(3);
    expect(currencyExponent('OMR')).toBe(3);
    expect(currencyExponent('JOD')).toBe(3);
    expect(currencyExponent('TND')).toBe(3);
    expect(currencyExponent('IDR')).toBe(2);
  });

  it('overrides display decimals for cash-practice currencies without touching the stored exponent', () => {
    expect(displayDecimals('IDR')).toBe(0);
    expect(currencyExponent('IDR')).toBe(2);
    expect(displayDecimals('ISK')).toBe(0);
    expect(displayDecimals('SGD')).toBe(currencyExponent('SGD'));
  });

  it('every displayDecimals override key is a real currency in the table', () => {
    for (const code of Object.keys(DISPLAY_DECIMAL_OVERRIDES)) {
      expect(isKnownCurrency(code)).toBe(true);
    }
  });

  it('knows every launch-relevant currency (SEA trip currencies + common home markets)', () => {
    const expected = [
      'SGD',
      'IDR',
      'THB',
      'VND',
      'MYR',
      'PHP',
      'JPY',
      'KRW',
      'TWD',
      'HKD',
      'CNY',
      'INR',
      'USD',
      'EUR',
      'GBP',
      'AUD',
      'NZD',
      'CAD',
      'CHF',
      'AED',
      'ISK',
    ];
    for (const code of expected) {
      expect(isKnownCurrency(code)).toBe(true);
      expect(currencySymbol(code)).not.toBe('');
    }
  });
});

describe('arithmetic', () => {
  it('adds and subtracts same-currency amounts exactly', () => {
    const a = money(1_500n, 'SGD');
    const b = money(250n, 'SGD');
    expect(add(a, b)).toEqual(money(1_750n, 'SGD'));
    expect(subtract(a, b)).toEqual(money(1_250n, 'SGD'));
  });

  it('throws on a currency mismatch instead of silently converting', () => {
    const sgd = money(1_000n, 'SGD');
    const idr = money(1_000n, 'IDR');
    expect(() => add(sgd, idr)).toThrow(DomainError);
    expect(() => subtract(sgd, idr)).toThrow(DomainError);
    expect(() => compare(sgd, idr)).toThrow(DomainError);
  });

  it('negates, compares and reports zero/negative correctly', () => {
    const ten = money(1_000n, 'SGD');
    expect(negate(ten)).toEqual(money(-1_000n, 'SGD'));
    expect(isZero(zero('SGD'))).toBe(true);
    expect(isZero(ten)).toBe(false);
    expect(isNegative(negate(ten))).toBe(true);
    expect(compare(ten, money(500n, 'SGD'))).toBe(1);
    expect(compare(money(500n, 'SGD'), ten)).toBe(-1);
    expect(compare(ten, money(1_000n, 'SGD'))).toBe(0);
    expect(equalsMoney(ten, money(1_000n, 'SGD'))).toBe(true);
    expect(equalsMoney(ten, money(1_000n, 'IDR'))).toBe(false);
  });

  it('sums a list of same-currency amounts, and zero for an empty list', () => {
    const items = [money(100n, 'SGD'), money(200n, 'SGD'), money(300n, 'SGD')];
    expect(sumMoney('SGD', items)).toEqual(money(600n, 'SGD'));
    expect(sumMoney('SGD', [])).toEqual(zero('SGD'));
  });

  it('splits a zero-exponent currency (JPY) total exactly, minor unit == major unit', () => {
    const total = money(1_001n, 'JPY');
    const oneThird = multiplyByRational(total, { numerator: 1n, denominator: 3n }, 'half_even');
    const twoThirds = subtract(total, oneThird);
    expect(add(oneThird, twoThirds)).toEqual(total);
  });

  it('rejects a non-positive rational denominator', () => {
    expect(() =>
      multiplyByRational(money(100n, 'SGD'), { numerator: 1n, denominator: 0n }, 'half_even'),
    ).toThrow(DomainError);
    expect(() =>
      multiplyByRational(money(100n, 'SGD'), { numerator: 1n, denominator: -2n }, 'down'),
    ).toThrow(DomainError);
  });
});

describe(
  'property: arithmetic is exact over random bigint amounts (10k cases)',
  PROPERTY_SUITE_OPTIONS,
  () => {
    const currencyArb = fc.constantFrom('SGD', 'JPY', 'IDR', 'BHD', 'USD');
    const amountArb = fc.bigInt({ min: -1_000_000_000_000n, max: 1_000_000_000_000n });

    it('subtract(add(a, b), b) === a', () => {
      fc.assert(
        fc.property(currencyArb, amountArb, amountArb, (currency, a, b) => {
          const ma = money(a, currency);
          const mb = money(b, currency);
          return equalsMoney(subtract(add(ma, mb), mb), ma);
        }),
        { numRuns: 10_000 },
      );
    });

    it('add is commutative and negate is its own inverse', () => {
      fc.assert(
        fc.property(currencyArb, amountArb, amountArb, (currency, a, b) => {
          const ma = money(a, currency);
          const mb = money(b, currency);
          return equalsMoney(add(ma, mb), add(mb, ma)) && equalsMoney(negate(negate(ma)), ma);
        }),
        { numRuns: 10_000 },
      );
    });
  },
);
