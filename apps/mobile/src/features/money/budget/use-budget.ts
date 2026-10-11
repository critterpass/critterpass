/**
 * The trip budget for either UI, from synced rows (expenses, the budget plan, plan items) through
 * the engine's forecast; it re-counts as soon as a new expense syncs. An organiser sets the crew's
 * target (`set_trip_budget`, online: with no signal it says so and the typed amount stays).
 */
import { forecast } from '@cp/cost-engine';
import { useLingui } from '@lingui/react/macro';
import { useMemo } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useCommandFeedback } from '@/motion/island-toast';

import { fxContextOf } from '../add-expense/preview';
import { setTripBudgetCommand } from '../data/commands';
import { useLiveRows } from '../data/live-rows';
import {
  BUDGET_SQL,
  BUDGET_TABLES,
  FX_RUN_SQL,
  FX_TABLES,
  PLAN_ITEMS_SQL,
  PLAN_ITEMS_TABLES,
  type BudgetRow,
  type FxRow,
  type PlanItemRow,
} from '../data/queries';
import { useSelectedTrip } from '../data/selected-trip';
import { useMoneyContext } from '../data/use-money-context';
import { useTripMoney } from '../data/use-trip-money';
import { budgetInput } from './model';

export type BudgetState = ReturnType<typeof useBudget>;

export function useBudget() {
  const ctx = useMoneyContext(useSelectedTrip());
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const { t } = useLingui();
  const { report } = useCommandFeedback();
  const save = useCommand(setTripBudgetCommand);
  const trip = ctx.trip;
  const currency = ctx.crew?.settlementCurrency ?? 'USD';
  const budget = useLiveRows<BudgetRow>(
    BUDGET_SQL,
    trip === null ? null : [trip.id],
    BUDGET_TABLES,
  );
  const plan = useLiveRows<PlanItemRow>(
    PLAN_ITEMS_SQL,
    trip?.versionId == null ? null : [trip.id, trip.versionId],
    PLAN_ITEMS_TABLES,
  );
  const local = trip?.localCurrency ?? currency;
  const fxRows = useLiveRows<FxRow>(
    FX_RUN_SQL,
    local === currency ? null : [local, currency],
    FX_TABLES,
  );
  const model = useMemo(() => {
    if (trip === null) return null;
    const input = budgetInput({
      now: new Date(),
      tz: trip.tz,
      startDate: trip.startDate,
      days: trip.days,
      crewCurrency: currency,
      budget: budget.rows[0] ?? null,
      expenses: rows.expenses,
      planItems: plan.rows,
      fx: fxContextOf(fxRows.rows, local),
    });
    return { today: input.today, forecast: forecast(input) };
  }, [trip, currency, budget.rows, rows.expenses, plan.rows, fxRows.rows, local]);

  if (ctx.status === 'loading' || (ctx.status === 'ready' && !rows.loaded)) {
    return { kind: 'loading' } as const;
  }
  if (trip === null || model === null) return { kind: 'no-trip', crew: ctx.crew !== null } as const;
  const place = trip.destinationName ?? '';
  const tripId = trip.id;
  /** Sends the crew target; true once it went through. */
  const saveTarget = async (amount: bigint): Promise<boolean> => {
    if (save.pending) return false;
    const result = await save.send({ trip_id: tripId, target_minor: Number(amount) });
    const outcome = report(result, {
      id: 'money-budget',
      done: t({ id: 'money.budget.saved', message: 'Budget set.' }),
    });
    return outcome === 'done';
  };
  return {
    kind: 'ready',
    tripId,
    title:
      place === ''
        ? t({ id: 'money.budget.titleNoPlace', message: 'Trip budget' })
        : t({ id: 'money.budget.title', message: `${place} budget` }),
    currency,
    today: model.today,
    days: trip.days,
    forecast: model.forecast,
    organiser: trip.organiser || ctx.crew?.organiser === true,
    saving: save.pending,
    saveTarget,
  } as const;
}
