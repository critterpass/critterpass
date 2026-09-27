/**
 * Pure FX conversion (docs/product-decisions.md's FX rule): a `Money` amount times a pinned
 * `FxSnapshot`'s exact rate, rounded once at the end. The rate string and the amount both stay
 * bigint-backed the entire way through — parsed into a numerator/denominator pair, never into a
 * float — so a conversion is exactly reproducible from the same snapshot id forever.
 */
import { DomainError } from '@cp/domain';

import { currencyExponent, type CurrencyCode } from '../money/currencies';
import { type Money } from '../money/money';
import { divideRounded, type RoundingMode } from '../money/round';
import { type FxSnapshot } from './snapshot';

interface Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

/** Parses an exact decimal string (as stored in `numeric(20,10)`) into an exact bigint ratio. */
function parseDecimalRational(decimal: string): Rational {
  if (!DECIMAL_PATTERN.test(decimal)) {
    throw new DomainError('VALIDATION', { reason: 'invalid_fx_rate', rate: decimal });
  }
  const negative = decimal.startsWith('-');
  const unsigned = negative ? decimal.slice(1) : decimal;
  const [wholePart = '0', fractionPart = ''] = unsigned.split('.');
  const numerator = BigInt(wholePart + fractionPart) * (negative ? -1n : 1n);
  return { numerator, denominator: 10n ** BigInt(fractionPart.length) };
}

/** The exact ratio `1 from = ratio to`, derived from a snapshot relating the two currencies directly. */
function directionalRate(from: CurrencyCode, to: CurrencyCode, snapshot: FxSnapshot): Rational {
  const rate = parseDecimalRational(snapshot.rate);
  if (from === snapshot.base && to === snapshot.quote) {
    return rate;
  }
  if (from === snapshot.quote && to === snapshot.base) {
    return { numerator: rate.denominator, denominator: rate.numerator };
  }
  throw new DomainError('VALIDATION', {
    reason: 'snapshot_currency_mismatch',
    from,
    to,
    base: snapshot.base,
    quote: snapshot.quote,
  });
}

/** Applies an exact rate ratio to `amountMinor`, adjusting for the two currencies' ISO exponents. */
function applyRate(
  amountMinor: bigint,
  from: CurrencyCode,
  to: CurrencyCode,
  rate: Rational,
  mode: RoundingMode,
): bigint {
  const exponentDelta = currencyExponent(to) - currencyExponent(from);
  const numerator =
    exponentDelta >= 0 ? rate.numerator * 10n ** BigInt(exponentDelta) : rate.numerator;
  const denominator =
    exponentDelta < 0 ? rate.denominator * 10n ** BigInt(-exponentDelta) : rate.denominator;
  return divideRounded(amountMinor * numerator, denominator, mode);
}

/**
 * Converts `money` into `target` using a snapshot that directly relates the two currencies (either
 * as its base/quote pair, in either direction). A no-op (returns `money` unchanged) when `target`
 * already matches — no snapshot required for that case.
 */
export function convert(
  money: Money,
  target: CurrencyCode,
  snapshot: FxSnapshot,
  mode: RoundingMode = 'half_even',
): Money {
  if (money.currency === target) {
    return money;
  }
  const rate = directionalRate(money.currency, target, snapshot);
  return {
    amountMinor: applyRate(money.amountMinor, money.currency, target, rate, mode),
    currency: target,
  };
}

/**
 * Converts `money` into `target` via a shared base currency (docs/product-decisions.md: "cross
 * rates via EUR base") when no snapshot relates the two directly — e.g. SGD -> IDR from two
 * EUR-based snapshots (EUR -> SGD, EUR -> IDR) fetched in the same ingest run.
 */
export function convertViaBase(
  money: Money,
  target: CurrencyCode,
  fromBase: FxSnapshot,
  toBase: FxSnapshot,
  mode: RoundingMode = 'half_even',
): Money {
  if (money.currency === target) {
    return money;
  }
  if (fromBase.base !== toBase.base) {
    throw new DomainError('VALIDATION', {
      reason: 'cross_base_mismatch',
      fromBase: fromBase.base,
      toBase: toBase.base,
    });
  }
  if (fromBase.quote !== money.currency) {
    throw new DomainError('VALIDATION', {
      reason: 'cross_source_mismatch',
      expected: money.currency,
      actual: fromBase.quote,
    });
  }
  if (toBase.quote !== target) {
    throw new DomainError('VALIDATION', {
      reason: 'cross_target_mismatch',
      expected: target,
      actual: toBase.quote,
    });
  }

  // 1 money.currency = (base -> target) / (base -> money.currency) target.
  const baseToSource = parseDecimalRational(fromBase.rate);
  const baseToTarget = parseDecimalRational(toBase.rate);
  const rate: Rational = {
    numerator: baseToTarget.numerator * baseToSource.denominator,
    denominator: baseToTarget.denominator * baseToSource.numerator,
  };
  return {
    amountMinor: applyRate(money.amountMinor, money.currency, target, rate, mode),
    currency: target,
  };
}
