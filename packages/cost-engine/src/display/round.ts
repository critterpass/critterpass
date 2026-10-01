/**
 * Display rounding for "each" figures: whole major units, half up ("$1,310 each"). The ledger and
 * every stored calc stay exact; only labels round, and a delta label is the difference of the two
 * rounded labels so "+$24 each" always matches the odometer going from $1,310 to $1,334.
 */
import { currencyExponent, type CurrencyCode } from '../money/currencies';
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

/**
 * Whole major units below which nobody quotes a price in the currency's everyday cash: an estimate
 * is never shown finer than this. Currencies not listed use one whole unit.
 */
export const ESTIMATE_CASH_STEP_MAJOR: Readonly<Partial<Record<CurrencyCode, bigint>>> = {
  VND: 1_000n,
  IDR: 1_000n,
};

/**
 * Display rounding for estimates (a stay's nightly range, a cost each before anything is booked):
 * three significant digits, half up, and never finer than the currency's cash step, so an estimate
 * does not claim the precision of a receipt ("₫3,340,000 each", "₫467,000 a night"; "$202" stays
 * "$202"). Real expenses, shares and settlements are never rounded this way.
 */
export function roundEstimate(amount: Money): Money {
  const unit = 10n ** BigInt(currencyExponent(amount.currency));
  const cash = (ESTIMATE_CASH_STEP_MAJOR[amount.currency] ?? 1n) * unit;
  const size = amount.amountMinor < 0n ? -amount.amountMinor : amount.amountMinor;
  let step = 1n;
  while (size / step >= 1_000n) step *= 10n;
  if (step < cash) step = cash;
  return {
    amountMinor: divideRounded(amount.amountMinor, step, 'half_up') * step,
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
