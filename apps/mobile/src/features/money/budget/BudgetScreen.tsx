/**
 * The trip budget from synced rows (expenses, the budget plan, plan items) through the engine's
 * forecast; it re-counts as soon as a new expense syncs. An organiser sets the crew's target here
 * (`set_trip_budget`, online: with no signal the sheet stays open and says so), typed in whole
 * units of the crew's currency and read as money while it is typed.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { amountText, digitsToMinor } from '@/data/money/amount-digits';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { AmountField } from '@/ui/inputs/AmountField';
import { Sheet } from '@/ui/sheet/Sheet';
import { makeStyles } from '@/ui/theme';

import { MoneyNoTripScreen, MoneyScreenLoading } from '../components/screen-states';
import { BudgetView } from './BudgetView';
import { useBudget } from './use-budget';
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
          shown={amountText(digits, currency, locale, 'whole')}
          placeholder={amountText('0', currency, locale, 'whole')}
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
  const budget = useBudget();
  const [sheet, setSheet] = useState(false);
  if (budget.kind === 'loading') return <MoneyScreenLoading />;
  if (budget.kind === 'no-trip') return <MoneyNoTripScreen crew={budget.crew} />;
  return (
    <WalletGuideProvider tripId={budget.tripId}>
      <>
        <BudgetView
          title={budget.title}
          currency={budget.currency}
          today={budget.today}
          days={budget.days}
          forecast={budget.forecast}
          organiser={budget.organiser}
          onSetBudget={() => setSheet(true)}
        />
        {sheet ? (
          <SetBudgetSheet
            currency={budget.currency}
            busy={budget.saving}
            onClose={() => setSheet(false)}
            onSave={(amount) => {
              void budget.saveTarget(amount).then((done) => {
                if (done) setSheet(false);
              });
            }}
          />
        ) : null}
      </>
    </WalletGuideProvider>
  );
}
