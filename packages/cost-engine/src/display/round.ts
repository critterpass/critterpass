/**
 * Display rounding for "each" figures: whole major units, half up ("$1,310 each"). The ledger and
 * every stored calc stay exact; only labels round, and a delta label is the difference of the two
 * rounded labels so "+$24 each" always matches the odometer going from $1,310 to $1,334.
 */
import { currencyExponent } from '../money/currencies';
import { type Money } from '../money/money';
import { divideRounded } from '../money/round';

/** Rounds to a whole major unit, half up (away from zero on .5). */
export function roundEach(amount: Money): Money {
  const unit = 10n ** BigInt(currencyExponent(amount.currency));
  return {
    amountMinor: divideRounded(amount.amountMinor, unit, 'half_up') * unit,
    currency: amount.currency,
  };
}

/** `after − before` between the two rounded labels. */
export function displayDelta(before: Money, after: Money): Money {
  return {
    amountMinor: roundEach(after).amountMinor - roundEach(before).amountMinor,
    currency: after.currency,
  };
}

/** The rounded mean of `amounts` (all in `currency`), for "crew average each" labels. */
export function roundedMean(amounts: readonly bigint[], currency: Money['currency']): Money {
  const total = amounts.reduce((sum, value) => sum + value, 0n);
  const mean = amounts.length === 0 ? 0n : divideRounded(total, BigInt(amounts.length), 'half_up');
  return roundEach({ amountMinor: mean, currency });
}
