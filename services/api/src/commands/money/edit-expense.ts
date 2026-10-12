/**
 * `edit_expense` and `delete_expense` (docs/api-contracts.md §4.9, offline). Whoever created or
 * paid the expense may change it, and so may an organiser. The payer and the split are people who
 * take part in the trip's money, or whom the expense already names (someone who has since left). A
 * stale `base_version` answers `VERSION_CONFLICT` with the current version. A money change reverses
 * the expense's ledger entries and derives new ones; a delete hides the expense and reverses them.
 * A by-room expense keeps taking its shares from the room plan until a new split is given.
 */
import {
  DomainError,
  deleteExpensePayloadSchema,
  editExpensePayloadSchema,
  type ExpenseResult,
} from '@cp/domain';

import {
  deleteExpense,
  loadExpense,
  requireVersion,
  updateExpense,
  type StoredExpense,
} from '../../money/expense-changes';
import { sharesFromSplit, type ExpenseFields, type ShareRow } from '../../money/expense-writer';
import { roomShares } from '../../money/room-split';
import { defineCommand } from '../_framework/define-command';
import {
  loadMoneyTrip,
  localDateIn,
  requireAllInTrip,
  requireExpenseEditor,
  tripDayOf,
  tripMoneyMembers,
} from './shared';

async function editable(
  tx: Parameters<typeof loadExpense>[0],
  expenseId: string,
  uid: string,
): Promise<StoredExpense> {
  const expense = await loadExpense(tx, expenseId);
  // Only a current member of the trip's crew reaches its money.
  await loadMoneyTrip(tx, expense.tripId);
  await requireExpenseEditor(
    tx,
    { trip_id: expense.tripId, created_by: expense.createdBy, payer_id: expense.payerId },
    uid,
  );
  if (expense.deletedAt !== null) throw new DomainError('STATE_INVALID', { reason: 'deleted' });
  return expense;
}

export const editExpenseCommand = defineCommand({
  name: 'edit_expense',
  v: 1,
  schema: editExpensePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await editable(tx, payload.expense_id, ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<ExpenseResult> => {
    await editable(tx, payload.expense_id, ctx.uid);
    const before = await loadExpense(tx, payload.expense_id, true);
    requireVersion(before, ctx.baseVersion ?? payload.base_version);
    const { patch } = payload;
    const trip = await loadMoneyTrip(tx, before.tripId);
    const payerId = patch.payer_uid ?? before.payerId;
    const amountMinor =
      patch.amount_minor === undefined ? before.amountMinor : BigInt(patch.amount_minor);
    const currency = patch.currency ?? before.currency;
    const moneyChanged =
      patch.amount_minor !== undefined || patch.currency !== undefined || patch.split !== undefined;
    if (moneyChanged && patch.split === undefined && before.splitMode === 'items') {
      // An itemised split is the receipt's lines; changing its total needs a new split.
      throw new DomainError('STATE_INVALID', { reason: 'itemised_needs_split' });
    }
    const byRoom =
      patch.split?.mode === 'by_room' ||
      (patch.split === undefined && before.splitMode === 'by_room');
    const stayKey =
      patch.split?.mode === 'by_room' ? patch.split.stay_key : (before.splitStayKey ?? null);
    const keepsItems = patch.split === undefined && before.splitMode === 'items';
    let shares: readonly ShareRow[];
    if (byRoom) {
      shares = await roomShares(tx, {
        tripId: before.tripId,
        amountMinor,
        currency,
        stayKey,
        payerId,
      });
    } else if (keepsItems) {
      shares = before.shares;
    } else {
      const split =
        patch.split !== undefined && patch.split.mode !== 'by_room'
          ? patch.split
          : {
              mode:
                before.splitMode === 'equal' || before.splitMode === 'weights'
                  ? before.splitMode
                  : ('fixed' as const),
              shares: before.shares.map((share) => ({
                user_id: share.userId,
                weight: share.weight,
                ...(before.splitMode === 'equal' || before.splitMode === 'weights'
                  ? {}
                  : { fixed_minor: Number(share.fixedMinor ?? share.computedMinor) }),
              })),
            };
      shares = sharesFromSplit(amountMinor, currency, split, payerId);
    }
    // Whoever the expense already names stays on it after leaving the crew, so an old expense can
    // still be changed; an edit cannot add someone who has left.
    requireAllInTrip(
      [
        ...(await tripMoneyMembers(tx, before.tripId)),
        before.payerId,
        ...before.shares.map((share) => share.userId),
      ],
      [payerId, ...shares.map((share) => share.userId)],
    );
    const spentAt = patch.spent_at === undefined ? before.spentAt : new Date(patch.spent_at);
    const localDate =
      patch.spent_at === undefined ? before.localDate : localDateIn(trip.tz, spentAt);
    const next: ExpenseFields = {
      id: before.id,
      crewId: before.crewId,
      tripId: before.tripId,
      payerId,
      amountMinor,
      currency,
      fxSnapshotId:
        patch.fx_snapshot_id !== undefined
          ? patch.fx_snapshot_id
          : patch.currency === undefined
            ? before.fxSnapshotId
            : null,
      crewCurrency: before.crewCurrency,
      splitMode: keepsItems
        ? 'items'
        : byRoom
          ? 'by_room'
          : (patch.split?.mode ?? before.splitMode),
      splitStayKey: byRoom ? stayKey : null,
      category: patch.category ?? before.category,
      description: patch.description ?? before.description,
      merchant: patch.merchant === undefined ? before.merchant : patch.merchant,
      spentAt,
      localDate,
      tripDay:
        patch.spent_at === undefined ? before.tripDay : tripDayOf(trip.start_date, localDate),
      shares,
    };
    return updateExpense(tx, before, next, ctx.uid);
  },
});

export const deleteExpenseCommand = defineCommand({
  name: 'delete_expense',
  v: 1,
  schema: deleteExpensePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await editable(tx, payload.expense_id, ctx.uid);
  },
  handle: async (tx, payload, ctx) => {
    await editable(tx, payload.expense_id, ctx.uid);
    const expense = await loadExpense(tx, payload.expense_id, true);
    requireVersion(expense, ctx.baseVersion ?? payload.base_version);
    return deleteExpense(tx, expense, ctx.uid, ctx.clock.serverNow);
  },
});
