import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { budgetAggregate } from '../../src/budget/aggregate';
import { breakdownBars } from '../../src/budget/breakdown';
import { budgetEstimates, crewFeasibleLow, planBreakdown } from '../../src/budget/estimates';
import { USD, dollars } from '../golden/design-chain.fixture';
import { PROPERTY_SUITE_OPTIONS } from '../property-budget';

const STEP = 5_000n;

function values(aggregate: ReturnType<typeof budgetAggregate>): bigint[] {
  return [aggregate.bandLowMinor, aggregate.bandHighMinor, aggregate.trackHighMinor].filter(
    (v): v is bigint => v !== null,
  );
}

describe('budget aggregate', () => {
  it('holds only the count below four maxes', () => {
    expect(
      budgetAggregate({
        maxes: [150_000n, 180_000n, 200_000n],
        memberCount: 6,
        currency: USD,
        feasibleLow: dollars(1_120),
        stepMinor: STEP,
        seed: 'trip',
      }),
    ).toEqual({
      maxesCount: 3,
      memberCount: 6,
      currency: USD,
      bandLowMinor: null,
      bandHighMinor: null,
      stepMinor: null,
      trackHighMinor: null,
      dots: null,
      underAllOk: null,
      infeasible: null,
    });
  });

  it('bands under the lowest max, and flags an infeasible crew anonymously', () => {
    const band = budgetAggregate({
      maxes: [140_000n, 145_000n, 150_000n, 160_000n, 180_000n, 200_000n],
      memberCount: 6,
      currency: USD,
      feasibleLow: dollars(1_120),
      stepMinor: STEP,
      seed: 'trip',
    });
    expect(band).toMatchObject({
      bandLowMinor: 112_000n,
      bandHighMinor: 135_000n,
      trackHighMinor: 200_000n,
      underAllOk: true,
      infeasible: false,
    });
    expect(band.dots).toHaveLength(6);
    const infeasible = budgetAggregate({
      maxes: [100_000n, 145_000n, 150_000n, 160_000n],
      memberCount: 6,
      currency: USD,
      feasibleLow: dollars(1_120),
      stepMinor: STEP,
      seed: 'trip',
    });
    expect(infeasible).toMatchObject({ bandHighMinor: null, infeasible: true, underAllOk: null });
  });
});

describe('budget aggregate privacy', PROPERTY_SUITE_OPTIONS, () => {
  it('never outputs a max, never reaches the lowest max', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 50_000, max: 500_000 }).map(BigInt), {
          minLength: 0,
          maxLength: 16,
        }),
        fc.option(fc.integer({ min: 0, max: 300_000 }).map(BigInt), { nil: null }),
        (maxes, feasible) => {
          const out = budgetAggregate({
            maxes,
            memberCount: 16,
            currency: USD,
            feasibleLow: feasible === null ? null : { amountMinor: feasible, currency: USD },
            stepMinor: STEP,
            seed: 'trip-property',
          });
          const exposed = values(out);
          const lowest = maxes.length > 0 ? maxes.reduce((a, b) => (a < b ? a : b)) : null;
          for (const max of maxes) {
            // The track end is on a ten-step grid; it may coincide with a max only by landing
            // exactly on that grid, which says nothing finer than the grid itself.
            if (out.bandHighMinor !== null) expect(out.bandHighMinor).not.toBe(max);
            if (out.bandLowMinor !== null && out.bandLowMinor !== feasible) {
              expect(out.bandLowMinor).not.toBe(max);
            }
          }
          if (lowest !== null && out.bandHighMinor !== null) {
            expect(out.bandHighMinor < lowest).toBe(true);
          }
          if (maxes.length < 4) expect(exposed).toEqual([]);
        },
      ),
      { numRuns: 1_000 },
    );
  });
});

describe('budget estimates', () => {
  const source = {
    currency: 'SGD',
    start_date: '2027-04-02',
    end_date: '2027-04-09',
    members: [
      { uid: 'a', home: 'SIN' },
      { uid: 'b', home: 'SGN' },
      { uid: 'c', home: null },
    ],
    fares: [
      {
        origin: 'SIN',
        price_minor: 52_000,
        currency: 'USD',
        days: [{ depart_on: '2027-04-02', price_minor: 50_000 }],
      },
      { origin: 'SGN', price_minor: 40_000, currency: 'USD', days: [] },
    ],
    indices: [
      {
        stay_type: 'ryokan',
        nightly_low_minor: 9_000,
        nightly_high_minor: 11_000,
        food_pp_day_minor: 2_750,
        fun_pp_day_minor: 1_250,
        currency: 'USD',
      },
    ],
    fx: [
      {
        id: 'fx-run',
        base: 'USD',
        quote: 'SGD',
        rate: '1.3',
        as_of: '2027-02-01',
        source: 'frankfurter',
      },
    ],
  };

  it('prices the crew in its own currency on the cheapest flight', () => {
    const estimates = budgetEstimates(source);
    expect(estimates).toMatchObject({ currency: 'SGD', nights: 7, days: 8 });
    expect(estimates.flights.get('a')).toEqual({ amountMinor: 65_000n, currency: 'SGD' });
    expect(estimates.flights.get('b')).toEqual({ amountMinor: 52_000n, currency: 'SGD' });
    expect(estimates.flights.get('c')).toBeNull();
    // 520 + 7 × 117 + 8 × (35.75 + 16.25) = 520 + 819 + 416 SGD.
    expect(crewFeasibleLow(estimates)).toEqual({ amountMinor: 175_500n, currency: 'SGD' });
    const plan = planBreakdown({ amountMinor: 200_000n, currency: 'SGD' }, estimates);
    expect(plan.flights).toEqual({ amountMinor: 52_000n, currency: 'SGD' });
    expect(plan.fits).toBe(true);
  });

  it('prices a dong crew with no fare on the ground part: stay, food and fun', () => {
    const estimates = budgetEstimates({
      ...source,
      currency: 'VND',
      start_date: '2027-04-02',
      end_date: '2027-04-04',
      fares: [],
      fx: [
        { id: 'fx-run', base: 'EUR', quote: 'USD', rate: '1.25', as_of: '2027-02-01', source: 'x' },
        {
          id: 'fx-run',
          base: 'EUR',
          quote: 'VND',
          rate: '32500',
          as_of: '2027-02-01',
          source: 'x',
        },
      ],
    });
    expect(estimates).toMatchObject({ currency: 'VND', nights: 2, days: 3 });
    expect([...estimates.flights.values()]).toEqual([null, null, null]);
    // A dollar is 26,000 ₫: 2 × $90 + 3 × ($27.50 + $12.50) = $300.
    expect(crewFeasibleLow(estimates)).toEqual({ amountMinor: 7_800_000n, currency: 'VND' });
    const target = { amountMinor: 10_400_000n, currency: 'VND' } as const;
    const plan = planBreakdown(target, estimates);
    expect(plan).toMatchObject({ flights: null, missing: ['flights'], fits: true });
    const bars = breakdownBars(target, plan);
    expect(bars?.flights.amountMinor).toBe(0n);
    expect(
      (bars?.stays.amountMinor ?? 0n) +
        (bars?.food.amountMinor ?? 0n) +
        (bars?.fun.amountMinor ?? 0n),
    ).toBe(10_400_000n);
  });

  it('has no low end before the dates are locked', () => {
    const estimates = budgetEstimates({ ...source, start_date: null, end_date: null });
    expect(crewFeasibleLow(estimates)).toBeNull();
  });
});
