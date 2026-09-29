/**
 * What an organiser can infer about other members' private maxes from everything the budget step
 * shows them: the crew-level band output, the answer to every lock they could try and their own
 * fit. Below four maxes none of it may depend on anyone else's number (only on "set / not set");
 * from four on, the band never touches the lowest max and the dots never sit on any max.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { computeBudgetBand, type BudgetBand } from '../../src/budget/band';
import { checkLockTarget, isInfeasible, ownFit } from '../../src/budget/feasibility';
import { money } from '../../src/money/money';
import { BUDGET_TRACK, USD } from '../golden/design-chain.fixture';
import { PROPERTY_SUITE_OPTIONS } from '../property-budget';

const STEP = 5_000n;
const TARGETS = Array.from({ length: 80 }, (_, i) => money(BigInt(i + 1) * STEP * 2n, USD));

function bandOf(maxes: readonly bigint[], memberCount: number, feasible: bigint): BudgetBand {
  return computeBudgetBand({
    maxes: maxes.map((value) => money(value, USD)),
    memberCount,
    feasibleLow: money(feasible, USD),
    stepMinor: STEP,
    track: BUDGET_TRACK,
    seed: 'trip-inference',
  });
}

/** Everything the organiser observes for one crew. */
function organiserView(
  own: bigint,
  others: readonly bigint[],
  memberCount: number,
  feasible: bigint,
) {
  const band = bandOf([own, ...others], memberCount, feasible);
  return {
    band,
    infeasible: isInfeasible(band),
    locks: TARGETS.map((target) => checkLockTarget(target, band, STEP)),
    fits: TARGETS.map((target) => ownFit(money(own, USD), target)),
  };
}

const amount = fc.integer({ min: 20_000, max: 400_000 }).map(BigInt);

describe('budget inference properties', PROPERTY_SUITE_OPTIONS, () => {
  for (const k of [2, 3]) {
    it(`with ${k} maxes the organiser learns only which maxes are set`, () => {
      fc.assert(
        fc.property(
          amount,
          fc.array(amount, { minLength: k - 1, maxLength: k - 1 }),
          fc.array(amount, { minLength: k - 1, maxLength: k - 1 }),
          fc.integer({ min: k, max: 16 }),
          amount,
          (own, othersA, othersB, memberCount, feasible) => {
            const a = organiserView(own, othersA, memberCount, feasible);
            const b = organiserView(own, othersB, memberCount, feasible);
            expect(a).toEqual(b);
            expect(a.band).toEqual({ state: 'waiting', submitted: k, of: memberCount });
            expect(a.infeasible).toBe(false);
            expect(a.locks.every((lock) => lock.ok || lock.reason === 'off_step')).toBe(true);
          },
        ),
        { numRuns: 500 },
      );
    });
  }

  it('never lets the band reach the lowest max across 1,000 random crews', () => {
    fc.assert(
      fc.property(
        fc.array(amount, { minLength: 4, maxLength: 16 }),
        fc.integer({ min: 0, max: 200_000 }).map(BigInt),
        (maxes, feasible) => {
          const band = bandOf(maxes, 16, feasible);
          if (band.state !== 'band') return;
          const lowest = maxes.reduce((a, b) => (a < b ? a : b));
          expect(band.high.amountMinor < lowest).toBe(true);
          expect(band.high.amountMinor % STEP).toBe(0n);
          for (const lock of TARGETS.map((target) => checkLockTarget(target, band, STEP))) {
            expect(lock.ok || lock.reason === 'over_band' || lock.reason === 'off_step').toBe(true);
          }
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it('never puts a dot on the position of any max', () => {
    const span = Number(BUDGET_TRACK.highMinor - BUDGET_TRACK.lowMinor);
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 100_000, max: 250_000 }).map(BigInt), {
          minLength: 4,
          maxLength: 16,
        }),
        (maxes) => {
          const band = bandOf(maxes, 16, 0n);
          const dots = band.state === 'waiting' ? [] : (band.dots ?? []);
          expect(dots).toHaveLength(maxes.length);
          // Every max is a whole number of minor units; every dot stands half a unit off it.
          for (const dot of dots) {
            const standsFor = Number(BUDGET_TRACK.lowMinor) + dot * span;
            expect(Math.abs(standsFor - Math.round(standsFor))).toBeGreaterThan(0.25);
            for (const value of maxes) expect(standsFor).not.toBe(Number(value));
          }
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it('answers a lock above the band with over_band and no distance', () => {
    const band = bandOf([150_000n, 180_000n, 200_000n, 260_000n], 4, 100_000n);
    expect(band.state).toBe('band');
    expect(checkLockTarget(money(150_000n, USD), band, STEP)).toEqual({
      ok: false,
      reason: 'over_band',
    });
    expect(checkLockTarget(money(145_000n, USD), band, STEP)).toEqual({
      ok: true,
      checkedAgainstBand: true,
    });
    expect(checkLockTarget(money(145_001n, USD), band, STEP)).toEqual({
      ok: false,
      reason: 'off_step',
    });
    const none = bandOf([90_000n, 180_000n, 200_000n, 260_000n], 4, 100_000n);
    expect(checkLockTarget(money(50_000n, USD), none, STEP)).toEqual({
      ok: false,
      reason: 'infeasible',
    });
  });
});
