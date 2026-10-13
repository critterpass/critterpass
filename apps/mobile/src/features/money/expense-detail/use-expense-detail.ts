/**
 * One expense for either UI, from synced rows (or the offline queue for one not uploaded yet). Opened for one
 * trip (a chat card), it is looked up in that trip whatever Balances shows. Deleting asks first,
 * goes once and queues offline; the ledger reverses it on the server and Balances follows.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useMemo, useRef } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';
import { useCommandFeedback } from '@/motion/island-toast';

import { MONEY_FALLBACK } from '../routes';
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
import type { DetailEdit, DetailShare } from './view-types';
import { canChangeExpense, changedFields, changesOf, fxLine } from './model';

export type ExpenseDetail = ReturnType<typeof useExpenseDetail>;

export function useExpenseDetail(expenseId: string, tripId: string | null = null) {
  const ctx = useMoneyContext(useSelectedTrip(), tripId);
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const { t } = useLingui();
  const { report } = useCommandFeedback();
  const remove = useCommand(deleteExpenseCommand);
  // One delete per open expense: a second tap while it goes out, or after, sends nothing.
  const deleting = useRef(false);
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

  if (ctx.status === 'loading' || (ctx.status === 'ready' && !rows.loaded)) {
    return { kind: 'loading' } as const;
  }
  if (ctx.trip === null) return { kind: 'no-trip', crew: ctx.crew !== null } as const;
  if (item === null) return { kind: 'gone' } as const;

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
  // Who put it in the ledger and when: the history's first line, after every change to it.
  const created = edits.rows.find((edit) => edit.kind === 'created');
  const addedBy = created?.editor_id ?? row?.created_by ?? null;
  const addedAt = created?.at ?? row?.created_at ?? null;
  const added =
    addedBy === null || addedAt === null
      ? null
      : { name: memberName(ctx.members, addedBy), at: addedAt };
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
    if (deleting.current) return;
    deleting.current = true;
    const result = await remove.send(
      { expense_id: expenseId },
      row?.version == null ? undefined : { baseVersion: row.version },
    );
    // Queued counts: the row shows as deleting until the phone is back online.
    const outcome = report(result, {
      id: 'money-deleted',
      offlineCapable: true,
      done: t({ id: 'money.detail.deletedToast', message: 'Expense deleted. Balances re-count.' }),
    });
    if (outcome === 'refused' || outcome === 'needs-signal') {
      deleting.current = false;
      return;
    }
    goBackOr(MONEY_FALLBACK);
  }

  return {
    kind: 'ready',
    tripId: ctx.trip.id,
    members: ctx.members,
    item,
    currency,
    fx,
    shares,
    history,
    added,
    canChange,
    onEdit: () => router.push(editExpenseRoute(expenseId, tripId)),
    confirmDelete,
  } as const;
}
