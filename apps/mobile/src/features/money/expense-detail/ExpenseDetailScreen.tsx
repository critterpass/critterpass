/**
 * One expense, from synced rows (or the offline queue for one not uploaded yet). Deleting asks
 * first and queues offline; the ledger reverses it on the server and Balances follows.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet, type ConfirmSheetProps } from '@/ui/states/ConfirmSheet';
import { makeStyles } from '@/ui/theme';
import { EmptyState } from '@/ui/states/EmptyState';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Stack } from '@/ui/layout/Stack';

import { MoneyLoading } from '../balances/BalancesScreen';
import { deleteExpenseCommand } from '../data/commands';
import { memberName } from '../data/context';
import { expenseItems } from '../data/expense-items';
import { useLiveRows } from '../data/live-rows';
import {
  EDITS_SQL,
  EDITS_TABLES,
  FX_BY_ID_SQL,
  FX_TABLES,
  minor,
  type EditRow,
  type FxRow,
} from '../data/queries';
import { useSelectedTrip } from '../data/selected-trip';
import { useMoneyContext } from '../data/use-money-context';
import { useTripMoney } from '../data/use-trip-money';
import { toMajor } from '../format';
import { editExpenseRoute } from '../routes';
import { ExpenseDetailView, type DetailEdit, type DetailShare } from './ExpenseDetailView';
import { canChangeExpense, changedFields, changesOf, fxLine } from './model';

/** The expense was deleted (here or on another phone) while it was open. */
function ExpenseGone() {
  const { t } = useLingui();
  const locale = useLocale();
  return (
    <Scaffold variant="dark" testID="money-expense-gone">
      <Stack gap="16" padding="20">
        <BackEyebrow label={upper(t({ id: 'money.back', message: 'Money' }), locale)} />
        <EmptyState
          guide="tokek"
          guideName={GUIDE_STICKERS.tokek.name}
          title={t({ id: 'money.detail.goneTitle', message: 'This expense is gone' })}
          line={t({
            id: 'money.detail.goneLine',
            message: 'Someone deleted it. The balances already left it out.',
          })}
        />
      </Stack>
    </Scaffold>
  );
}

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

export function ExpenseDetailScreen({ expenseId }: { readonly expenseId: string }) {
  const ctx = useMoneyContext(useSelectedTrip());
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const locale = useLocale();
  const { t } = useLingui();
  const [confirming, setConfirming] = useState(false);
  const remove = useCommand(deleteExpenseCommand);
  const row = rows.expenses.find((expense) => expense.id === expenseId) ?? null;
  const edits = useLiveRows<EditRow>(EDITS_SQL, [expenseId], EDITS_TABLES);
  const snapshot = useLiveRows<FxRow>(
    FX_BY_ID_SQL,
    row?.fx_snapshot_id == null ? null : [row.fx_snapshot_id],
    FX_TABLES,
  );
  const currency = ctx.crew?.settlementCurrency ?? 'USD';
  const item = useMemo(() => {
    if (ctx.trip === null) return null;
    return (
      expenseItems({
        expenses: rows.expenses,
        shares: rows.shares,
        pending: rows.pending,
        members: ctx.members,
        tripId: ctx.trip.id,
        tz: ctx.trip.tz,
        crewCurrency: currency,
      }).find((candidate) => candidate.id === expenseId) ?? null
    );
  }, [ctx.trip, ctx.members, rows, currency, expenseId]);

  if (ctx.status === 'loading' || !rows.loaded) return <MoneyLoading />;
  if (item === null) return <ExpenseGone />;

  const shares: DetailShare[] = rows.shares
    .filter((share) => share.expense_id === expenseId)
    .map((share) => ({
      userId: share.user_id,
      name: memberName(ctx.members, share.user_id),
      crewMinor: minor(share.crew_computed_minor),
    }));
  const history: DetailEdit[] = changesOf(edits.rows).map((edit) => ({
    id: edit.id,
    editorName: memberName(ctx.members, edit.editor_id ?? ''),
    kind: edit.kind === 'deleted' ? 'deleted' : 'edited',
    fields: changedFields(edit),
    at: edit.at,
  }));
  const fx =
    item.crewAmountMinor === null
      ? null
      : fxLine({
          amountMajor: toMajor(item.amountMinor, item.currency),
          currency: item.currency,
          crewAmountMajor: toMajor(item.crewAmountMinor, currency),
          crewCurrency: currency,
          snapshot: snapshot.rows[0] ?? null,
        });
  const canChange =
    item.pending !== 'add' &&
    canChangeExpense({
      uid: ctx.uid,
      createdBy: row?.created_by ?? null,
      payerId: item.payerId,
      organiser: ctx.crew?.organiser === true || ctx.trip?.organiser === true,
    });

  async function confirmDelete() {
    setConfirming(false);
    const result = await remove.send(
      { expense_id: expenseId },
      row?.version == null ? undefined : { baseVersion: row.version },
    );
    if (result.kind === 'rejected') return;
    toast.show({
      id: 'money-deleted',
      title: t({ id: 'money.detail.deletedToast', message: 'Expense deleted. Balances re-count.' }),
    });
    router.back();
  }

  return (
    <>
      <ExpenseDetailView
        item={item}
        crewCurrency={currency}
        fx={fx}
        shares={shares}
        edits={history}
        canChange={canChange}
        onEdit={() => router.push(editExpenseRoute(expenseId))}
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
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirming(false)}
          testID="money-delete-confirm"
        />
      ) : null}
    </>
  );
}
