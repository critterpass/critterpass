/**
 * The trip budget from synced rows (expenses, the budget plan, plan items) through the engine's
 * forecast; it re-counts as soon as a new expense syncs. An organiser sets the crew's target here
 * (`set_trip_budget`, online: with no signal the sheet stays open and says so), typed in whole
 * units of the crew's currency and read as money while it is typed.
 */
import { forecast } from '@cp/cost-engine';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { useCommandFeedback } from '@/motion/island-toast';
import { PillButton } from '@/ui/buttons/PillButton';
import { digitsToMinor } from '@/ui/inputs/amount-digits';
import { AmountField } from '@/ui/inputs/AmountField';
import { Sheet } from '@/ui/sheet/Sheet';
import { makeStyles } from '@/ui/theme';

import { fxContextOf } from '../add-expense/preview';
import { MoneyNoTripScreen, MoneyScreenLoading } from '../components/screen-states';
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
import { BudgetView } from './BudgetView';
import { budgetInput } from './model';
import { WalletGuideProvider } from '@/features/bookings';

const useStyles = makeStyles((t) => ({ body: { padding: t.space['16'], gap: t.space['16'] } }));

function SetBudgetSheet({
  currency,
  onSave,
  onClose,
  busy,
}: {
  readonly currency: string;
  readonly onSave: (minor: bigint) => void;
  readonly onClose: () => void;
  readonly busy: boolean;
}) {
  const styles = useStyles();
  const locale = useLocale();
  const { t } = useLingui();
  const [digits, setDigits] = useState('');
  const title = t({ id: 'money.budget.set', message: 'Set a crew budget' });
  // Whole units of the currency: a crew target never needs cents.
  const amount = digitsToMinor(digits, currency, 'whole');
  return (
    <Sheet
      detents={['fit']}
      title={title}
      onDismiss={onClose}
      accessibilityLabel={title}
      testID="money-budget-sheet"
    >
      <View style={styles.body}>
        <AmountField
          label={t({ id: 'money.budget.target', message: `Crew total in ${currency}` })}
          digits={digits}
          currency={currency}
          locale={locale}
          unit="whole"
          onDigits={setDigits}
          testID="money-budget-target"
        />
        <PillButton
          label={upper(t({ id: 'money.payout.save', message: 'Save' }), locale)}
          onPress={() => onSave(amount)}
          disabled={amount <= 0n}
          loading={busy}
          block
          testID="money-budget-save"
        />
      </View>
    </Sheet>
  );
}

export function BudgetScreen() {
  const ctx = useMoneyContext(useSelectedTrip());
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const { t } = useLingui();
  const { report } = useCommandFeedback();
  const save = useCommand(setTripBudgetCommand);
  const [sheet, setSheet] = useState(false);
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
    return <MoneyScreenLoading />;
  }
  if (trip === null || model === null) return <MoneyNoTripScreen crew={ctx.crew !== null} />;
  const place = trip.destinationName ?? '';
  const tripId = trip.id;
  return (
    <WalletGuideProvider tripId={ctx.trip?.id ?? null}>
      <>
        <BudgetView
          title={
            place === ''
              ? t({ id: 'money.budget.titleNoPlace', message: 'Trip budget' })
              : t({ id: 'money.budget.title', message: `${place} budget` })
          }
          currency={currency}
          today={model.today}
          days={trip.days}
          forecast={model.forecast}
          organiser={trip.organiser || ctx.crew?.organiser === true}
          onSetBudget={() => setSheet(true)}
        />
        {sheet ? (
          <SetBudgetSheet
            currency={currency}
            busy={save.pending}
            onClose={() => setSheet(false)}
            onSave={(amount) => {
              if (save.pending) return;
              void save.send({ trip_id: tripId, target_minor: Number(amount) }).then((result) => {
                const outcome = report(result, {
                  id: 'money-budget',
                  done: t({ id: 'money.budget.saved', message: 'Budget set.' }),
                });
                if (outcome === 'done') setSheet(false);
              });
            }}
          />
        ) : null}
      </>
    </WalletGuideProvider>
  );
}
