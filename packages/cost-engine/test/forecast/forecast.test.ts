import { describe, expect, it } from 'vitest';

import { biggestRemaining } from '../../src/forecast/biggest-remaining';
import { bookedCosts, registerBookedCostProvider } from '../../src/forecast/booked';
import { forecast, type ForecastExpense } from '../../src/forecast/forecast';

const usd = (dollars: number) => BigInt(dollars * 100);

// The Bali budget as drawn: day 5 of 8, $4,812 spent of $7,440, finishing $210 under.
const expenses: ForecastExpense[] = [
  { day: 1, category: 'stays', amountMinor: usd(1840) },
  { day: 1, category: 'transit', amountMinor: usd(220) },
  { day: 2, category: 'food', amountMinor: usd(400) },
  { day: 2, category: 'fun', amountMinor: usd(640) },
  { day: 3, category: 'food', amountMinor: usd(380) },
  { day: 3, category: 'transit', amountMinor: usd(400) },
  { day: 4, category: 'fun', amountMinor: usd(552) },
  { day: 5, category: 'food', amountMinor: usd(380) },
];
const remaining = [
  { id: 'boat', day: 6, category: 'fun', amountMinor: usd(900), label: 'The boat day' },
  { id: 'dinner', day: 7, category: 'food', amountMinor: usd(318), label: 'Jimbaran dinner' },
  {
    id: 'villa',
    day: 6,
    category: 'stays',
    amountMinor: usd(700),
    label: 'Villa, last two nights',
  },
  { id: 'fastboat', day: 8, category: 'transit', amountMinor: usd(500), label: 'Fast boat back' },
];
const bali = {
  days: 8,
  targetMinor: usd(7440),
  plannedByCategory: { stays: usd(2700), food: usd(1500), transit: usd(1100), fun: usd(2140) },
  plannedByDay: null,
  expenses,
  remaining,
  booked: [],
};

describe('trip budget forecast', () => {
  it('reproduces the design: $4,812 of $7,440, the category bars and $210 under', () => {
    const result = forecast(bali);
    expect(result.spentMinor).toBe(usd(4812));
    expect(result.plannedMinor).toBe(usd(7440));
    expect(
      result.categories.map((line) => [line.category, line.spentMinor, line.plannedMinor]),
    ).toEqual([
      ['stays', usd(1840), usd(2700)],
      ['food', usd(1160), usd(1500)],
      ['transit', usd(620), usd(1100)],
      ['fun', usd(1192), usd(2140)],
    ]);
    expect(result.forecastMinor).toBe(usd(7230));
    expect(result.finishDeltaMinor).toBe(usd(210));
    expect(result.biggest?.label).toBe('The boat day');
  });

  it('spreads the target over the days exactly when there is no day plan', () => {
    const result = forecast(bali);
    expect(result.days).toHaveLength(8);
    expect(result.days.reduce((total, day) => total + day.plannedMinor, 0n)).toBe(usd(7440));
    expect(result.days[1]?.spentMinor).toBe(usd(1040));
    expect(result.days[5]?.spentMinor).toBe(0n);
  });

  it('counts booked costs not yet expensed, and goes over the plan', () => {
    const result = forecast({
      ...bali,
      booked: [{ id: 'b1', day: 7, category: 'fun', amountMinor: usd(400), label: 'Snorkel trip' }],
    });
    expect(result.forecastMinor).toBe(usd(7630));
    expect(result.finishDeltaMinor).toBe(-usd(190));
  });

  it('has no plan line without a target or category plan', () => {
    const result = forecast({ ...bali, targetMinor: null, plannedByCategory: {} });
    expect(result.plannedMinor).toBeNull();
    expect(result.finishDeltaMinor).toBeNull();
    expect(result.days.every((day) => day.plannedMinor === 0n)).toBe(true);
  });

  it('breaks a tie for the biggest cost by day, then id', () => {
    const tie = [
      { id: 'b', day: 3, category: 'fun', amountMinor: 5n, label: null },
      { id: 'a', day: 3, category: 'fun', amountMinor: 5n, label: null },
      { id: 'c', day: 2, category: 'fun', amountMinor: 5n, label: null },
    ];
    expect(biggestRemaining(tie)?.id).toBe('c');
    expect(biggestRemaining([])).toBeNull();
  });

  it('asks the registered booked-cost provider, and nothing once it is removed', () => {
    const cost = { id: 'x', day: 1, category: 'stays', amountMinor: 1n, label: null };
    const unregister = registerBookedCostProvider(() => [cost]);
    expect(bookedCosts('trip')).toEqual([cost]);
    unregister();
    expect(bookedCosts('trip')).toEqual([]);
  });
});
