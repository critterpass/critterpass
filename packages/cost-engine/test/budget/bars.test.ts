import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { breakdownBars, budgetBreakdown } from '../../src/budget/breakdown';
import { money } from '../../src/money/money';
import { KYOTO_INDEX, USD, dollars } from '../golden/design-chain.fixture';
import { PROPERTY_SUITE_OPTIONS } from '../property-budget';

const base = { flights: dollars(520), nights: 7, days: 8, index: KYOTO_INDEX };

describe('breakdown bars', () => {
  it('shows the $1,350 plan as flights $520, stays $470, food $220, fun $140', () => {
    const target = dollars(1_350);
    expect(breakdownBars(target, budgetBreakdown({ ...base, target }))).toEqual({
      flights: dollars(520),
      stays: dollars(470),
      food: dollars(220),
      fun: dollars(140),
    });
  });

  it('shrinks every bar below the cheapest plan instead of overflowing', () => {
    const target = dollars(900);
    const bars = breakdownBars(target, budgetBreakdown({ ...base, target }));
    expect(bars).not.toBeNull();
    const parts = bars === null ? [] : [bars.flights, bars.stays, bars.food, bars.fun];
    expect(parts.reduce((a, m) => a + m.amountMinor, 0n)).toBe(90_000n);
  });

  it('has no bars before anything is priced', () => {
    const target = dollars(900);
    expect(
      breakdownBars(target, budgetBreakdown({ ...base, flights: null, index: null, target })),
    ).toBeNull();
  });
});

describe('breakdown bar properties', PROPERTY_SUITE_OPTIONS, () => {
  it('always sums to the target in minor units', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.option(fc.integer({ min: 1, max: 300_000 }), { nil: null }),
        fc.integer({ min: 0, max: 21 }),
        fc.boolean(),
        (targetMinor, flightMinor, nights, indexed) => {
          const target = money(BigInt(targetMinor), USD);
          const breakdown = budgetBreakdown({
            target,
            flights: flightMinor === null ? null : money(BigInt(flightMinor), USD),
            nights,
            days: nights + 1,
            index: indexed ? KYOTO_INDEX : null,
          });
          const bars = breakdownBars(target, breakdown);
          if (bars === null) return;
          const sum = [bars.flights, bars.stays, bars.food, bars.fun].reduce(
            (a, m) => a + m.amountMinor,
            0n,
          );
          expect(sum).toBe(target.amountMinor);
        },
      ),
    );
  });
});
