/**
 * Money lab scenes for the budget (3i-6): the Bali budget as drawn (day 5 of 8, $4,812 of $7,440,
 * $210 under), over budget, before the trip, and no budget set.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { forecast, type ForecastInput } from '@cp/cost-engine';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import { BudgetView } from '../budget/BudgetView';

const noop = () => undefined;
const usd = (dollars: number) => BigInt(dollars * 100);

const BALI: ForecastInput = {
  days: 8,
  targetMinor: usd(7440),
  plannedByCategory: { stays: usd(2700), food: usd(1500), transit: usd(1100), fun: usd(2140) },
  plannedByDay: [1000, 1000, 1000, 1000, 1000, 800, 820, 820].map(usd),
  expenses: [
    { day: 1, category: 'stays', amountMinor: usd(620) },
    { day: 1, category: 'transit', amountMinor: usd(220) },
    { day: 1, category: 'food', amountMinor: usd(150) },
    { day: 2, category: 'stays', amountMinor: usd(620) },
    { day: 2, category: 'food', amountMinor: usd(250) },
    { day: 3, category: 'stays', amountMinor: usd(600) },
    { day: 3, category: 'food', amountMinor: usd(200) },
    { day: 3, category: 'transit', amountMinor: usd(100) },
    { day: 4, category: 'fun', amountMinor: usd(1192) },
    { day: 5, category: 'food', amountMinor: usd(560) },
    { day: 5, category: 'transit', amountMinor: usd(300) },
  ],
  remaining: [
    { id: 'boat', day: 6, category: 'fun', amountMinor: usd(900), label: 'The boat day' },
    { id: 'villa', day: 6, category: 'stays', amountMinor: usd(700), label: 'Villa' },
    { id: 'dinner', day: 7, category: 'food', amountMinor: usd(318), label: 'Jimbaran dinner' },
    { id: 'fast', day: 8, category: 'transit', amountMinor: usd(500), label: 'Fast boat back' },
  ],
  booked: [],
};

function Budget({
  input,
  today,
  organiser = true,
}: {
  readonly input: ForecastInput;
  readonly today: number;
  readonly organiser?: boolean;
}) {
  const { t } = useLingui();
  const place = 'Bali';
  return (
    <BudgetView
      title={t({ id: 'money.budget.title', message: `${place} budget` })}
      currency="USD"
      today={today}
      days={input.days}
      forecast={forecast(input)}
      organiser={organiser}
      onSetBudget={noop}
    />
  );
}

export const BUDGET_SCENES: Readonly<Record<string, () => ReactNode>> = {
  budget: () => <Budget input={BALI} today={5} />,
  'budget-over': () => (
    <Budget
      input={{
        ...BALI,
        expenses: [...BALI.expenses, { day: 5, category: 'fun', amountMinor: usd(2900) }],
      }}
      today={5}
    />
  ),
  'budget-pre-trip': () => <Budget input={{ ...BALI, expenses: [] }} today={0} />,
  'budget-none': () => (
    <Budget
      input={{ ...BALI, targetMinor: null, plannedByCategory: {}, plannedByDay: null }}
      today={5}
    />
  ),
};
