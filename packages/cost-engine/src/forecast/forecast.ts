/**
 * The trip budget and its forecast (3i-6), all exact minor units in the crew currency: spent vs
 * planned overall, by category (stays / food / transit / fun) and by trip day, and the forecast
 * finish = what was spent + the plan items still ahead + booked costs not yet expensed. The
 * difference to the plan ("$210 under") and the biggest cost left come from the same numbers.
 */
import { allocateByWeights } from '../ledger/split';
import { biggestRemaining, type RemainingCost } from './biggest-remaining';

export const FORECAST_CATEGORIES = ['stays', 'food', 'transit', 'fun'] as const;
export type ForecastCategory = (typeof FORECAST_CATEGORIES)[number];

export interface ForecastExpense {
  /** Trip day (1-based); 0 before the trip, above `days` after it. */
  readonly day: number;
  readonly category: string;
  readonly amountMinor: bigint;
}

export interface ForecastInput {
  readonly days: number;
  /** The crew's target (the budget plan); null when nobody set one. */
  readonly targetMinor: bigint | null;
  readonly plannedByCategory: Partial<Record<ForecastCategory, bigint>>;
  /** Planned spend per day (index 0 = day 1); null spreads the target evenly. */
  readonly plannedByDay: readonly bigint[] | null;
  readonly expenses: readonly ForecastExpense[];
  /** Plan items not yet happened and not yet expensed. */
  readonly remaining: readonly RemainingCost[];
  readonly booked: readonly RemainingCost[];
}

export interface CategoryLine {
  readonly category: ForecastCategory;
  readonly spentMinor: bigint;
  readonly plannedMinor: bigint;
}

export interface DayLine {
  readonly day: number;
  readonly spentMinor: bigint;
  readonly plannedMinor: bigint;
}

export interface Forecast {
  readonly spentMinor: bigint;
  readonly plannedMinor: bigint | null;
  readonly categories: readonly CategoryLine[];
  readonly days: readonly DayLine[];
  readonly remainingMinor: bigint;
  readonly forecastMinor: bigint;
  /** Plan − forecast: positive finishes under, negative over; null without a plan. */
  readonly finishDeltaMinor: bigint | null;
  readonly biggest: RemainingCost | null;
}

const sum = (values: readonly bigint[]) => values.reduce((total, value) => total + value, 0n);

function dayPlan(input: ForecastInput): bigint[] {
  if (input.days <= 0) return [];
  if (input.plannedByDay !== null && input.plannedByDay.length > 0) {
    return Array.from({ length: input.days }, (_, index) => input.plannedByDay?.[index] ?? 0n);
  }
  if (input.targetMinor === null || input.targetMinor <= 0n) {
    return Array.from({ length: input.days }, () => 0n);
  }
  return allocateByWeights(
    input.targetMinor,
    Array.from({ length: input.days }, () => 1n),
  );
}

export function forecast(input: ForecastInput): Forecast {
  const spentMinor = sum(input.expenses.map((expense) => expense.amountMinor));
  const categories = FORECAST_CATEGORIES.map((category) => ({
    category,
    spentMinor: sum(
      input.expenses.filter((e) => e.category === category).map((e) => e.amountMinor),
    ),
    plannedMinor: input.plannedByCategory[category] ?? 0n,
  }));
  const plan = dayPlan(input);
  const days = plan.map((plannedMinor, index) => ({
    day: index + 1,
    plannedMinor,
    spentMinor: sum(input.expenses.filter((e) => e.day === index + 1).map((e) => e.amountMinor)),
  }));
  const ahead = [...input.remaining, ...input.booked];
  const remainingMinor = sum(ahead.map((cost) => cost.amountMinor));
  const plannedMinor =
    input.targetMinor ??
    (categories.some((line) => line.plannedMinor > 0n)
      ? sum(categories.map((line) => line.plannedMinor))
      : null);
  const forecastMinor = spentMinor + remainingMinor;
  return {
    spentMinor,
    plannedMinor,
    categories,
    days,
    remainingMinor,
    forecastMinor,
    finishDeltaMinor: plannedMinor === null ? null : plannedMinor - forecastMinor,
    biggest: biggestRemaining(ahead),
  };
}
