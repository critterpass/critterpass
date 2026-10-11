/**
 * One expense (its data and delete are `useExpenseDetail`). Deleting asks first in a sheet.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { WalletGuideProvider } from '@/features/bookings';
import { useLocale } from '@/lib/i18n/use-locale';
import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet, type ConfirmSheetProps } from '@/ui/states/ConfirmSheet';
import { makeStyles } from '@/ui/theme';

import { ExpenseGone, MoneyNoTripScreen, MoneyScreenLoading } from '../components/screen-states';
import { ExpenseDetailView } from './ExpenseDetailView';
import { useExpenseDetail } from './use-expense-detail';

const useConfirmStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'] },
}));

/** The delete confirm, risen in a sheet over the tab bar. */
function DeleteConfirm(props: ConfirmSheetProps) {
  const styles = useConfirmStyles();
  return (
    <Sheet detents={['fit']} onDismiss={props.onCancel} accessibilityLabel={props.title}>
      <View style={styles.body}>
        <ConfirmSheet {...props} />
      </View>
    </Sheet>
  );
}

export function ExpenseDetailScreen({
  expenseId,
  tripId = null,
}: {
  readonly expenseId: string;
  /** The trip the expense belongs to, when the opener knows it (a chat card). */
  readonly tripId?: string | null;
}) {
  const locale = useLocale();
  const { t } = useLingui();
  const detail = useExpenseDetail(expenseId, tripId);
  const [confirming, setConfirming] = useState(false);
  if (detail.kind === 'loading') return <MoneyScreenLoading />;
  if (detail.kind === 'no-trip') return <MoneyNoTripScreen crew={detail.crew} />;
  if (detail.kind === 'gone') return <ExpenseGone />;
  return (
    <WalletGuideProvider tripId={detail.tripId}>
      <>
        <ExpenseDetailView
          item={detail.item}
          crewCurrency={detail.currency}
          fx={detail.fx}
          shares={detail.shares}
          edits={detail.history}
          canChange={detail.canChange}
          onEdit={detail.onEdit}
          onDelete={() => setConfirming(true)}
        />
        {confirming ? (
          <DeleteConfirm
            title={t({ id: 'money.detail.deleteTitle', message: 'Delete this expense?' })}
            consequences={[
              t({
                id: 'money.detail.deleteLedger',
                message: 'Everyone’s balance goes back to how it was before it.',
              }),
              t({
                id: 'money.detail.deleteHistory',
                message: 'The crew still sees it in the history.',
              }),
            ]}
            confirmLabel={upper(t({ id: 'money.detail.deleteConfirm', message: 'Delete' }), locale)}
            mode="button"
            onConfirm={() => {
              setConfirming(false);
              void detail.confirmDelete();
            }}
            onCancel={() => setConfirming(false)}
            testID="money-delete-confirm"
          />
        ) : null}
      </>
    </WalletGuideProvider>
  );
}
