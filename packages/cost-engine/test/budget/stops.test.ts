import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { budgetBreakdown, feasibleLow, type CostIndex } from '../../src/budget/breakdown';
import {
  budgetEstimates,
  crewFeasibleLow,
  planBreakdown,
  type BudgetEstimateSource,
} from '../../src/budget/estimates';
import { chooseStayMix } from '../../src/budget/stay-mix';
import { chooseStopsStayMix, stopDays, type StopEstimate } from '../../src/budget/stops';
import { money } from '../../src/money/money';
import { PROPERTY_SUITE_OPTIONS } from '../property-budget';

const usd = (dollars: number) => money(BigInt(dollars * 100), 'USD');
const row = (
  stay: string,
  low: number,
  high: number,
  food: number,
  fun: number,
  currency = 'USD',
) => ({
  stay_type: stay,
  nightly_low_minor: low,
  nightly_high_minor: high,
  food_pp_day_minor: food,
  fun_pp_day_minor: fun,
  currency,
});

const DANANG = [
  row('hostel', 1_000, 2_000, 1_500, 1_000),
  row('hotel', 3_000, 5_000, 1_500, 1_000),
];
const HUE = [row('homestay', 800, 1_200, 1_000, 500), row('hotel', 2_000, 3_000, 1_000, 500)];

/** Đà Nẵng two nights then Huế two nights, nobody's flight priced. */
const source = (hue: BudgetEstimateSource['indices'] = HUE): BudgetEstimateSource => ({
  currency: 'USD',
  start_date: '2027-03-01',
  end_date: '2027-03-05',
  members: [{ uid: 'u-1', home: null }],
  fares: [],
  indices: DANANG,
  stops: [
    { position: 1, destination_id: 'danang', nights: 2, indices: DANANG },
    { position: 2, destination_id: 'hue', nights: 2, indices: hue },
  ],
  fx: [
    { id: 'fx-1', base: 'USD', quote: 'VND', rate: '25000', as_of: '2027-02-01', source: 'test' },
  ],
});

describe('the budget of Đà Nẵng two nights then Huế two nights', () => {
  it('counts the travel day to Huế and the last day to the last stop', () => {
    expect(stopDays([2, 2])).toEqual([2, 3]);
    expect(stopDays([4])).toEqual([5]);
    const estimates = budgetEstimates(source());
    expect(estimates.stops?.map((stop) => [stop.nights, stop.days])).toEqual([
      [2, 2],
      [2, 3],
    ]);
    // The trip's own index is still its destination's.
    expect(estimates.index?.stays.map((stay) => stay.type)).toEqual(['hostel', 'hotel']);
  });

  it('adds each stop priced from its own index', () => {
    const estimates = budgetEstimates(source());
    // Cheapest nights 2 × $10 + 2 × $8, food 2 × $15 + 3 × $10, fun 2 × $10 + 3 × $5.
    expect(crewFeasibleLow(estimates)).toEqual(usd(131));
    expect(planBreakdown(usd(300), estimates)).toEqual({
      flights: null,
      stays: usd(124),
      food: usd(60),
      fun: usd(116),
      stayMix: [
        { type: 'hotel', nights: 2, stop: 1 },
        { type: 'homestay', nights: 2, stop: 2 },
      ],
      missing: ['flights'],
      fits: true,
    });
    expect(planBreakdown(usd(190), estimates).stayMix).toEqual([
      { type: 'hotel', nights: 1, stop: 1 },
      { type: 'hostel', nights: 1, stop: 1 },
      { type: 'homestay', nights: 2, stop: 2 },
    ]);
    expect(planBreakdown(usd(170), estimates)).toMatchObject({
      stays: usd(64),
      fun: usd(46),
      fits: true,
      stayMix: [
        { type: 'hostel', nights: 2, stop: 1 },
        { type: 'homestay', nights: 2, stop: 2 },
      ],
    });
    expect(planBreakdown(usd(150), estimates)).toMatchObject({ fits: false, fun: usd(35) });
  });

  it('shows stays, food and fun as missing when one stop has no index', () => {
    const estimates = budgetEstimates(source([]));
    expect(crewFeasibleLow(estimates)).toBeNull();
    expect(planBreakdown(usd(300), estimates)).toMatchObject({
      stays: null,
      food: null,
      fun: null,
      stayMix: null,
      missing: ['flights', 'stays', 'food', 'fun'],
    });
  });

  it('converts a stop priced in another currency before adding it, and misses it with no rate', () => {
    const inDong = [
      row('homestay', 200_000, 300_000, 250_000, 125_000, 'VND'),
      row('hotel', 500_000, 750_000, 250_000, 125_000, 'VND'),
    ];
    const estimates = budgetEstimates(source(inDong));
    expect(crewFeasibleLow(estimates)).toEqual(usd(131));
    expect(planBreakdown(usd(300), estimates)).toEqual(
      planBreakdown(usd(300), budgetEstimates(source())),
    );
    expect(crewFeasibleLow(budgetEstimates({ ...source(inDong), fx: [] }))).toBeNull();
  });

  it('gives a tie to the earlier stop, then the stay type that sorts first', () => {
    const rates = [
      { type: 'hostel', nightlyPpMinor: 1_000n },
      { type: 'inn', nightlyPpMinor: 2_000n },
      { type: 'hotel', nightlyPpMinor: 2_000n },
    ];
    const mix = chooseStopsStayMix(
      [
        { position: 1, nights: 2, rates },
        { position: 2, nights: 2, rates },
      ],
      5_000n,
    );
    expect(mix).toEqual({
      parts: [
        { type: 'hotel', nights: 1, stop: 1 },
        { type: 'hostel', nights: 1, stop: 1 },
        { type: 'hostel', nights: 2, stop: 2 },
      ],
      costMinor: 5_000n,
      fits: true,
    });
  });
});

const amount = fc.bigInt({ min: 1n, max: 500_000n });
const indexArb: fc.Arbitrary<CostIndex> = fc.record({
  currency: fc.constant('USD' as const),
  stays: fc
    .uniqueArray(fc.constantFrom('apartment', 'hostel', 'hotel', 'ryokan'), { minLength: 1 })
    .chain((types) =>
      fc.tuple(
        ...types.map((type) =>
          fc.tuple(amount, amount).map(([a, b]) => ({
            type,
            nightlyLowMinor: a < b ? a : b,
            nightlyHighMinor: a < b ? b : a,
          })),
        ),
      ),
    ),
  foodPpDayMinor: amount,
  funPpDayMinor: amount,
});
const stopsArb: fc.Arbitrary<StopEstimate[]> = fc
  .array(fc.tuple(fc.integer({ min: 1, max: 9 }), indexArb), { minLength: 1, maxLength: 6 })
  .map((stops) => {
    const days = stopDays(stops.map(([nights]) => nights));
    return stops.map(([nights, index], at) => ({
      position: at + 1,
      destinationId: `stop-${at + 1}`,
      nights,
      days: days[at] ?? nights,
      index,
    }));
  });
const flightsArb = fc.option(
  fc.bigInt({ min: 0n, max: 300_000n }).map((v) => money(v, 'USD')),
  {
    nil: null,
  },
);
const targetArb = fc.bigInt({ min: 0n, max: 30_000_000n }).map((v) => money(v, 'USD'));

describe('the budget over one to six stops', PROPERTY_SUITE_OPTIONS, () => {
  it('is the sum of each stop worked out alone', () => {
    fc.assert(
      fc.property(stopsArb, flightsArb, targetArb, (stops, flights, target) => {
        const alone = stops.map((stop) => ({
          low: feasibleLow({
            flights: null,
            nights: stop.nights,
            days: stop.days,
            index: stop.index,
          }),
          // A target of nothing never fits, so its fun is the stop's fun floor.
          floor: budgetBreakdown({
            target: money(0n, 'USD'),
            flights: null,
            nights: stop.nights,
            days: stop.days,
            index: stop.index,
          }),
        }));
        const total = (pick: (one: (typeof alone)[number]) => bigint | undefined) =>
          alone.reduce((sum, one) => sum + (pick(one) ?? 0n), 0n);
        const all = { flights, nights: 0, days: 0, index: null, stops };
        const breakdown = budgetBreakdown({ ...all, target });
        const food = total((one) => one.floor.food?.amountMinor);
        const funFloor = total((one) => one.floor.fun?.amountMinor);
        expect(breakdown.food?.amountMinor).toBe(food);
        expect(budgetBreakdown({ ...all, target: money(0n, 'USD') }).fun?.amountMinor).toBe(
          funFloor,
        );
        expect(feasibleLow(all)?.amountMinor).toBe(
          (flights?.amountMinor ?? 0n) + total((one) => one.low?.amountMinor),
        );
        if (breakdown.fits) {
          const left = target.amountMinor - (flights?.amountMinor ?? 0n) - food - funFloor;
          expect(breakdown.stays?.amountMinor ?? 0n).toBeLessThanOrEqual(left);
          expect(breakdown.fun?.amountMinor ?? 0n).toBeGreaterThanOrEqual(funFloor);
        }
      }),
    );
  });

  it('equals the one-destination budget when the trip has one stop', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        indexArb,
        flightsArb,
        targetArb,
        (nights, index, flights, target) => {
          const one = { flights, nights, days: nights + 1, index };
          const stops = [{ position: 1, destinationId: 'only', ...one }];
          const several = budgetBreakdown({ ...one, target, stops });
          expect({
            ...several,
            stayMix: several.stayMix?.map(({ type, nights: n }) => ({ type, nights: n })) ?? null,
          }).toEqual(budgetBreakdown({ ...one, target }));
          expect(feasibleLow({ ...one, stops })).toEqual(feasibleLow(one));
          const rates = index.stays.map((s) => ({
            type: s.type,
            nightlyPpMinor: s.nightlyHighMinor,
          }));
          expect(
            chooseStopsStayMix([{ position: 1, nights, rates }], target.amountMinor)?.costMinor,
          ).toBe(chooseStayMix(rates, nights, target.amountMinor)?.costMinor);
        },
      ),
    );
  });
});
