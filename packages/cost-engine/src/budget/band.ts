/**
 * The budget sweet spot (3c-5) from write-only private maxes. Maxes go in; only a coarse band,
 * a count and (from four maxes) bucketed anonymous dots come out:
 * - nothing crew-level at all until four maxes are in (`waiting`, "3 of 6"): no band, no dots,
 *   no under-all check and no infeasible notice, so a crew of two or three learns nothing about
 *   each other's numbers;
 * - the upper edge is the lowest max floored to a step of the crew's currency (an amount people
 *   say out loud: 500k ₫, $50) and never equal to it, so the output
 *   only says the lowest max lies somewhere in (high, high + step];
 * - dots sit in buckets whose width is a whole number of steps on the same grid, so they narrow
 *   nothing the band did not already say, and never on a max's own position.
 */
import { DomainError } from '@cp/domain';

import { currencyExponent, type CurrencyCode } from '../money/currencies';
import { type Money } from '../money/money';
import { convertWith, type FxContext } from '../shares/fx';
import { bucketDots, type DotTrack } from './dots';

export const BAND_MIN_MAXES = 4;
export const DOTS_MIN_MAXES = 4;
/** The size a step aims for where the currency has no step of its own: about $50. */
export const BAND_STEP_USD_MINOR = 5_000n;

/**
 * Steps people say out loud, in whole units of the currency: half a million đồng, a quarter of a
 * million rupiah, five thousand yen, fifty dollars or euros.
 */
const SPOKEN_STEP: Readonly<Partial<Record<CurrencyCode, bigint>>> = {
  VND: 500_000n,
  IDR: 250_000n,
  JPY: 5_000n,
  USD: 50n,
  EUR: 50n,
};

/** The round amount (1, 2 or 5 followed by zeros) closest to `value` by ratio. */
function nearestRound(value: bigint): bigint {
  let best = 1n;
  const closer = (a: bigint, b: bigint): boolean => {
    const [aHigh, aLow] = a > value ? [a, value] : [value, a];
    const [bHigh, bLow] = b > value ? [b, value] : [value, b];
    return aHigh * bLow < bHigh * aLow;
  };
  for (let scale = 1n; scale <= value * 10n; scale *= 10n) {
    for (const digit of [1n, 2n, 5n]) {
      if (closer(digit * scale, best)) best = digit * scale;
    }
  }
  return best;
}

/**
 * The budget knob's step in `currency` minor units: the currency's own spoken step, else the
 * round amount nearest $50 through the calc's FX snapshot (S$50, ฿2,000, ₩50,000). A currency
 * with neither a step of its own nor a rate has no step: this throws, never a dollar-sized guess.
 */
export function bandStepMinor(currency: CurrencyCode, fx?: FxContext): bigint {
  const spoken = SPOKEN_STEP[currency];
  if (spoken !== undefined) return spoken * 10n ** BigInt(currencyExponent(currency));
  const step = convertWith({ amountMinor: BAND_STEP_USD_MINOR, currency: 'USD' }, currency, fx);
  return nearestRound(step.amountMinor > 0n ? step.amountMinor : 1n);
}

export interface BudgetBandInput {
  /** Submitted private maxes, already in the trip currency. Never echoed back. */
  readonly maxes: readonly Money[];
  /** Crew size, for "k of N" and "under all N maxes". */
  readonly memberCount: number;
  /** The cheapest workable trip each (see `feasibleLow`). */
  readonly feasibleLow: Money;
  readonly stepMinor: bigint;
  /** The knob's track, for dot positions. */
  readonly track: DotTrack;
  /** Stable per trip, so dots do not dance between recomputes. */
  readonly seed: string;
}

export type BudgetBand =
  | { readonly state: 'waiting'; readonly submitted: number; readonly of: number }
  | {
      readonly state: 'no_sweet_spot';
      readonly submitted: number;
      readonly of: number;
      readonly feasibleLow: Money;
      readonly dots: readonly number[] | null;
    }
  | {
      readonly state: 'band';
      readonly submitted: number;
      readonly of: number;
      readonly low: Money;
      readonly high: Money;
      /** Every crew member has submitted a max and the band sits under all of them. */
      readonly underAll: boolean;
      readonly dots: readonly number[] | null;
    };

export function computeBudgetBand(input: BudgetBandInput): BudgetBand {
  const { maxes, memberCount, feasibleLow, stepMinor } = input;
  const submitted = maxes.length;
  if (stepMinor <= 0n) throw new DomainError('VALIDATION', { reason: 'non_positive_step' });
  if (maxes.some((m) => m.currency !== feasibleLow.currency)) {
    throw new DomainError('VALIDATION', { reason: 'currency_mismatch' });
  }
  if (submitted < BAND_MIN_MAXES) return { state: 'waiting', submitted, of: memberCount };

  const lowest = maxes.reduce(
    (min, m) => (m.amountMinor < min ? m.amountMinor : min),
    maxes[0]?.amountMinor ?? 0n,
  );
  const dots =
    submitted >= DOTS_MIN_MAXES
      ? bucketDots(
          maxes.map((m) => m.amountMinor),
          stepMinor,
          input.track,
          input.seed,
        )
      : null;
  const high = lowest <= 0n ? -1n : ((lowest - 1n) / stepMinor) * stepMinor;
  if (high < feasibleLow.amountMinor) {
    return { state: 'no_sweet_spot', submitted, of: memberCount, feasibleLow, dots };
  }
  return {
    state: 'band',
    submitted,
    of: memberCount,
    low: feasibleLow,
    high: { amountMinor: high, currency: feasibleLow.currency },
    underAll: submitted >= memberCount,
    dots,
  };
}

export type KnobPosition = 'no_band' | 'below_band' | 'in_band' | 'above_band';

/** Where the knob sits against the band; `above_band` shows the over-someone's-max warning. */
export function knobPosition(target: Money, band: BudgetBand): KnobPosition {
  if (band.state !== 'band') return 'no_band';
  if (target.amountMinor < band.low.amountMinor) return 'below_band';
  if (target.amountMinor > band.high.amountMinor) return 'above_band';
  return 'in_band';
}
