/**
 * The budget screen's inputs from synced rows: which trip day it is (in the trip's time zone), the
 * expenses in the crew currency by day and category, the crew's plan (the budget plan's target and
 * category breakdown, flights counted as transit), and the plan items still ahead converted to the
 * crew currency with the device's FX run. The engine does the rest.
 */
/* eslint-disable lingui/no-unlocalized-strings -- category keys and JSON fields, never copy. */
import {
  convertWith,
  type ForecastCategory,
  type ForecastInput,
  type FxContext,
  type RemainingCost,
} from '@cp/cost-engine';

import { categoryFromWords } from '../add-expense/suggest';
import { json, minor, type BudgetRow, type ExpenseRow, type PlanItemRow } from '../data/queries';

const DAY_MS = 86_400_000;

/** The calendar date at `at` in `tz` (`YYYY-MM-DD`). */
export function localDate(at: Date, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz ?? undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** 1-based trip day of a calendar date; 0 before the trip, above `days` after it. */
export function tripDayOf(date: string, startDate: string | null): number {
  if (startDate === null) return 0;
  const diff = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(diff)) return 0;
  return Math.max(0, Math.floor(diff / DAY_MS) + 1);
}

interface Breakdown {
  readonly flights?: number;
  readonly stays?: number;
  readonly food?: number;
  readonly fun?: number;
}

export function plannedByCategory(
  row: BudgetRow | null,
): Partial<Record<ForecastCategory, bigint>> {
  if (row === null) return {};
  const breakdown = json<Breakdown>(row.breakdown, {});
  const out: Partial<Record<ForecastCategory, bigint>> = {};
  if (breakdown.stays !== undefined) out.stays = BigInt(breakdown.stays);
  if (breakdown.food !== undefined) out.food = BigInt(breakdown.food);
  if (breakdown.flights !== undefined) out.transit = BigInt(breakdown.flights);
  if (breakdown.fun !== undefined) out.fun = BigInt(breakdown.fun);
  return out;
}

export function budgetInput(input: {
  readonly now: Date;
  readonly tz: string | null;
  readonly startDate: string | null;
  readonly days: number;
  readonly crewCurrency: string;
  readonly budget: BudgetRow | null;
  readonly expenses: readonly ExpenseRow[];
  readonly planItems: readonly PlanItemRow[];
  readonly fx: FxContext | null;
}): ForecastInput & { readonly today: number } {
  const today = tripDayOf(localDate(input.now, input.tz), input.startDate);
  const expenses = input.expenses
    .filter((row) => row.crew_currency === input.crewCurrency)
    .map((row) => ({
      day:
        row.trip_day ??
        tripDayOf(
          row.local_date ?? localDate(new Date(row.spent_at ?? ''), input.tz),
          input.startDate,
        ),
      category: row.category ?? 'other',
      amountMinor: minor(row.crew_amount_minor),
    }));
  const remaining: RemainingCost[] = [];
  for (const item of input.planItems) {
    if (item.starts_at === null || Date.parse(item.starts_at) <= input.now.getTime()) continue;
    if (item.amount_minor === null || item.currency === null || item.amount_minor <= 0) continue;
    let amountMinor: bigint;
    try {
      amountMinor = convertWith(
        { amountMinor: minor(item.amount_minor), currency: item.currency },
        input.crewCurrency,
        item.currency === input.crewCurrency ? undefined : (input.fx ?? undefined),
      ).amountMinor;
    } catch {
      continue;
    }
    remaining.push({
      id: item.id,
      day: tripDayOf(localDate(new Date(item.starts_at), item.tz ?? input.tz), input.startDate),
      category: categoryFromWords(item.category) ?? 'other',
      amountMinor,
      label: item.poi_name,
    });
  }
  const sameCurrency = input.budget !== null && input.budget.currency === input.crewCurrency;
  const days = json<number[] | null>(input.budget?.planned_by_day, null);
  return {
    today,
    days: input.days,
    targetMinor: sameCurrency && input.budget !== null ? minor(input.budget.target_minor) : null,
    plannedByCategory: sameCurrency ? plannedByCategory(input.budget) : {},
    plannedByDay: Array.isArray(days) ? days.map((value) => BigInt(value)) : null,
    expenses,
    remaining,
    booked: [],
  };
}
