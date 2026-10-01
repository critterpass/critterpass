/**
 * The budget page's figures as it prints them. What was spent is exact; what was planned is an
 * estimate (the guide's prices before anything is booked), so it is rounded the way every estimate
 * is (`roundEstimate`: three significant digits, never finer than the cash step, ₫1,000). A label
 * that compares the two ("Over by", "On track to finish … under") is the difference of the figures
 * shown beside it, so it always adds up on screen.
 */
import { isKnownCurrency, roundEstimate, type Forecast } from '@cp/cost-engine';

/** An estimate in minor units, rounded for display (unknown currencies as they are). */
export function estimateMinor(amountMinor: bigint, currency: string): bigint {
  if (!isKnownCurrency(currency)) return amountMinor;
  return roundEstimate({ amountMinor, currency }).amountMinor;
}

/**
 * The finish line's amount: the rounded plan less the rounded forecast spend (positive is under).
 * Null without a plan.
 */
export function finishDeltaShown(forecast: Forecast, currency: string): bigint | null {
  const planned = forecast.plannedMinor;
  const delta = forecast.finishDeltaMinor;
  if (planned === null || delta === null) return null;
  return estimateMinor(planned, currency) - estimateMinor(planned - delta, currency);
}

/** What was spent outside the four planned categories (OTHER), so the card adds up to SPENT. */
export function otherSpentMinor(forecast: Forecast): bigint {
  const counted = forecast.categories.reduce((sum, line) => sum + line.spentMinor, 0n);
  const other = forecast.spentMinor - counted;
  return other > 0n ? other : 0n;
}
