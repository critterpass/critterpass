/**
 * The crew-level budget row (`trip_budget_aggregates`) from the current setup members' maxes, as
 * the recompute job writes it. Below four maxes: the count and nothing else. From four: the band
 * (the cheapest workable trip up to one step under the lowest max), anonymous bucketed dots on a
 * track from 0 to the highest max rounded up to ten steps (coarser than any dot's bucket, so the
 * track's end says less than the dots do), whether every member has a max in and the
 * band sits under all of them, and the anonymous infeasible flag. Maxes go in; none comes out.
 */
import { type CurrencyCode } from '../money/currencies';
import { type Money } from '../money/money';
import { BAND_MIN_MAXES, computeBudgetBand } from './band';

const TRACK_GRID_STEPS = 10n;

export interface BudgetAggregateInput {
  /** Current setup members' maxes in the crew currency. */
  readonly maxes: readonly bigint[];
  readonly memberCount: number;
  readonly currency: CurrencyCode;
  /** The cheapest workable trip; `null` when prices are missing (then no infeasible check). */
  readonly feasibleLow: Money | null;
  readonly stepMinor: bigint;
  /** Stable per trip (the trip id), so dots do not dance between recomputes. */
  readonly seed: string;
}

export interface BudgetAggregate {
  readonly maxesCount: number;
  readonly memberCount: number;
  readonly currency: CurrencyCode;
  readonly bandLowMinor: bigint | null;
  readonly bandHighMinor: bigint | null;
  readonly stepMinor: bigint | null;
  readonly trackHighMinor: bigint | null;
  readonly dots: readonly number[] | null;
  readonly underAllOk: boolean | null;
  readonly infeasible: boolean | null;
}

export function budgetAggregate(input: BudgetAggregateInput): BudgetAggregate {
  const empty = {
    maxesCount: input.maxes.length,
    memberCount: input.memberCount,
    currency: input.currency,
    bandLowMinor: null,
    bandHighMinor: null,
    stepMinor: null,
    trackHighMinor: null,
    dots: null,
    underAllOk: null,
    infeasible: null,
  };
  if (input.maxes.length < BAND_MIN_MAXES) return empty;
  const highest = input.maxes.reduce((a, b) => (a > b ? a : b));
  const grid = input.stepMinor * TRACK_GRID_STEPS;
  const trackHigh = ((highest + grid - 1n) / grid) * grid;
  const band = computeBudgetBand({
    maxes: input.maxes.map((amountMinor) => ({ amountMinor, currency: input.currency })),
    memberCount: input.memberCount,
    feasibleLow: input.feasibleLow ?? { amountMinor: 0n, currency: input.currency },
    stepMinor: input.stepMinor,
    track: { lowMinor: 0n, highMinor: trackHigh },
    seed: input.seed,
  });
  switch (band.state) {
    case 'waiting':
      return empty;
    case 'no_sweet_spot':
      return {
        ...empty,
        stepMinor: input.stepMinor,
        trackHighMinor: trackHigh,
        dots: band.dots,
        infeasible: true,
      };
    case 'band':
      return {
        ...empty,
        bandLowMinor: band.low.amountMinor,
        bandHighMinor: band.high.amountMinor,
        stepMinor: input.stepMinor,
        trackHighMinor: trackHigh,
        dots: band.dots,
        underAllOk: band.underAll,
        infeasible: false,
      };
  }
}
