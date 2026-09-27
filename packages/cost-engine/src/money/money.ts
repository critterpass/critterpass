/**
 * Exact money: integer minor units + ISO currency (docs/code-standards.md §2). A `Money` value never
 * carries a float; every arithmetic op here works on `bigint` and every currency mismatch is a typed
 * `DomainError`, not a silently wrong number.
 */
import { DomainError } from '@cp/domain';

import { assertCurrencyCode, type CurrencyCode } from './currencies';
import { divideRounded, type RoundingMode } from './round';

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;
}

/** An exact ratio (e.g. a tax rate or an FX rate) applied by multiplying, never by a float. */
export interface Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

/** The one boundary constructor: validates a raw currency string and returns an exact `Money`. */
export function money(amountMinor: bigint, currencyCode: string): Money {
  return { amountMinor, currency: assertCurrencyCode(currencyCode) };
}

export function zero(currencyCode: CurrencyCode): Money {
  return { amountMinor: 0n, currency: currencyCode };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new DomainError('VALIDATION', {
      reason: 'currency_mismatch',
      expected: a.currency,
      actual: b.currency,
    });
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function negate(a: Money): Money {
  return { amountMinor: -a.amountMinor, currency: a.currency };
}

export function isZero(a: Money): boolean {
  return a.amountMinor === 0n;
}

export function isNegative(a: Money): boolean {
  return a.amountMinor < 0n;
}

export function equalsMoney(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

/** -1 / 0 / 1 like `Array#sort` comparators; throws on a currency mismatch rather than guessing. */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

/** Sums a list of same-currency amounts; returns `zero(currencyCode)` for an empty list. */
export function sumMoney(currencyCode: CurrencyCode, items: readonly Money[]): Money {
  return items.reduce((total, item) => add(total, item), zero(currencyCode));
}

/**
 * Multiplies by an exact rational (e.g. a percentage or FX rate) and rounds the bigint result per
 * `mode`. `rational.denominator` must be positive; use this rather than converting to a JS `number`
 * for any scaling operation on money.
 */
export function multiplyByRational(m: Money, rational: Rational, mode: RoundingMode): Money {
  if (rational.denominator <= 0n) {
    throw new DomainError('VALIDATION', { reason: 'non_positive_denominator' });
  }
  return {
    amountMinor: divideRounded(m.amountMinor * rational.numerator, rational.denominator, mode),
    currency: m.currency,
  };
}
