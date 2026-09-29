/**
 * Changing an expense: the stored row as the caller sees it, the version check, and the edit and
 * delete writes. A change that moves money reverses the expense's live ledger entries and derives
 * new ones; words, category and dates leave the ledger alone.
 */
import { reverseEntries } from '@cp/cost-engine';
import { emitEvent } from '@cp/db';
import {
  DomainError,
  MONEY_RT,
  type ExpenseCategory,
  type ExpenseResult,
  type ExpenseSplitMode,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { publishMoney } from '../commands/money/shared';
import {
  entriesFor,
  price,
  result,
  snapshot,
  writeShares,
  type ExpenseFields,
} from './expense-writer';
import { liveEntries, writeLedgerEntries } from './ledger';
import { reissueStaleRequests } from './settle';

export interface StoredExpense extends ExpenseFields {
  readonly version: number;
  readonly createdBy: string;
  readonly deletedAt: Date | null;
}

interface ExpenseRow {
  readonly id: string;
  readonly crew_id: string;
  readonly trip_id: string;
  readonly payer_id: string;
  readonly amount_minor: string;
  readonly currency: string;
  readonly fx_snapshot_id: string | null;
  readonly crew_currency: string;
  readonly split_mode: ExpenseSplitMode;
  readonly category: ExpenseCategory;
  readonly description: string;
  readonly merchant: string | null;
  readonly spent_at: Date;
  readonly local_date: string;
  readonly trip_day: number | null;
  readonly version: number;
  readonly created_by: string;
  readonly deleted_at: Date | null;
}

/** The expense as the caller sees it (`lock`: re-read under its row lock as the system). */
export async function loadExpense(
  tx: pg.PoolClient,
  expenseId: string,
  lock = false,
): Promise<StoredExpense> {
  const read = async () => {
    const { rows } = await tx.query<ExpenseRow>(
      `SELECT id, crew_id, trip_id, payer_id, amount_minor::text, currency, fx_snapshot_id,
              crew_currency, split_mode, category, description, merchant, spent_at,
              local_date::text AS local_date, trip_day, version, created_by, deleted_at
         FROM expenses WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [expenseId],
    );
    const row = rows[0];
    if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'expense' });
    const shares = await tx.query<{
      user_id: string;
      weight: number;
      fixed_minor: string | null;
      computed_minor: string;
    }>(
      `SELECT user_id, weight, fixed_minor::text, computed_minor::text FROM expense_shares
        WHERE expense_id = $1 ORDER BY created_at, id`,
      [expenseId],
    );
    return { row, shares: shares.rows };
  };
  const { row, shares } = lock ? await asSystemRole(tx, read) : await read();
  return {
    id: row.id,
    crewId: row.crew_id,
    tripId: row.trip_id,
    payerId: row.payer_id,
    amountMinor: BigInt(row.amount_minor),
    currency: row.currency,
    fxSnapshotId: row.fx_snapshot_id,
    crewCurrency: row.crew_currency,
    splitMode: row.split_mode,
    category: row.category,
    description: row.description,
    merchant: row.merchant,
    spentAt: row.spent_at,
    localDate: row.local_date,
    tripDay: row.trip_day,
    version: row.version,
    createdBy: row.created_by,
    deletedAt: row.deleted_at,
    shares: shares.map((share) => ({
      userId: share.user_id,
      weight: share.weight,
      fixedMinor: share.fixed_minor === null ? null : BigInt(share.fixed_minor),
      computedMinor: BigInt(share.computed_minor),
    })),
  };
}

/** The version the client edited from must still be current. */
export function requireVersion(expense: StoredExpense, base: number | undefined): void {
  if (base !== undefined && base !== expense.version) {
    throw new DomainError('VERSION_CONFLICT', {
      current_version: expense.version,
      expense_id: expense.id,
    });
  }
}

/** Whether an edit changes who owes what (words, category and dates never touch the ledger). */
function movesMoney(before: ExpenseFields, next: ExpenseFields): boolean {
  const shareKey = (fields: ExpenseFields) =>
    fields.shares.map((share) => `${share.userId}:${share.computedMinor}`).join(',');
  return (
    before.amountMinor !== next.amountMinor ||
    before.currency !== next.currency ||
    before.fxSnapshotId !== next.fxSnapshotId ||
    before.crewCurrency !== next.crewCurrency ||
    before.payerId !== next.payerId ||
    shareKey(before) !== shareKey(next)
  );
}

/**
 * Replaces an expense's fields (`next`, same id): reverses its live entries and derives new ones
 * when anything that moves money changed, then records the edit.
 */
export async function updateExpense(
  tx: pg.PoolClient,
  before: StoredExpense,
  next: ExpenseFields,
  editorId: string,
): Promise<ExpenseResult> {
  const priced = await price(tx, next);
  const previous = await price(tx, before);
  const version = before.version + 1;
  await asSystemRole(tx, async () => {
    if (movesMoney(before, next)) {
      const reversals = reverseEntries(await liveEntries(tx, 'expense', before.id));
      await writeLedgerEntries(tx, [...reversals, ...entriesFor(next, priced)]);
      await writeShares(tx, next, priced);
    }
    await tx.query(
      `UPDATE expenses SET payer_id = $2, amount_minor = $3, currency = $4, fx_snapshot_id = $5,
         crew_amount_minor = $6, crew_currency = $7, split_mode = $8, category = $9,
         description = $10, merchant = $11, spent_at = $12, local_date = $13, trip_day = $14,
         version = $15
       WHERE id = $1`,
      [
        next.id,
        next.payerId,
        next.amountMinor.toString(),
        next.currency,
        priced.fxSnapshotId,
        priced.crewAmountMinor.toString(),
        next.crewCurrency,
        next.splitMode,
        next.category,
        next.description,
        next.merchant,
        next.spentAt,
        next.localDate,
        next.tripDay,
        version,
      ],
    );
    await tx.query(
      `INSERT INTO expense_edits (expense_id, trip_id, editor_id, kind, before, after)
       VALUES ($1, $2, $3, 'edited', $4, $5)`,
      [
        next.id,
        next.tripId,
        editorId,
        JSON.stringify(snapshot(before, previous)),
        JSON.stringify(snapshot(next, priced)),
      ],
    );
  });
  await publishMoney(tx, next.crewId, MONEY_RT.expenseEdited, {
    expense_id: next.id,
    trip_id: next.tripId,
    version,
  });
  await publishMoney(tx, next.crewId, MONEY_RT.balancesUpdated, { crew_id: next.crewId });
  await emitEvent(tx, {
    type: 'expense.edited',
    aggregateKind: 'expense',
    aggregateId: next.id,
    actorKind: 'user',
    actorId: editorId,
    crewId: next.crewId,
    tripId: next.tripId,
    payload: { trip_id: next.tripId, crew_id: next.crewId, expense_id: next.id, version },
  });
  await reissueStaleRequests(tx, next.crewId, next.tripId, next.crewCurrency);
  return result(next, priced, version);
}

/** Hides the expense and reverses its live entries; its history and shares stay. */
export async function deleteExpense(
  tx: pg.PoolClient,
  expense: StoredExpense,
  editorId: string,
  at: Date,
): Promise<{ expense_id: string; version: number }> {
  const version = expense.version + 1;
  await asSystemRole(tx, async () => {
    await writeLedgerEntries(tx, reverseEntries(await liveEntries(tx, 'expense', expense.id)));
    await tx.query(
      'UPDATE expenses SET deleted_at = $2, deleted_by = $3, version = $4 WHERE id = $1',
      [expense.id, at, editorId, version],
    );
    await tx.query(
      `INSERT INTO expense_edits (expense_id, trip_id, editor_id, kind, before)
       VALUES ($1, $2, $3, 'deleted', $4)`,
      [expense.id, expense.tripId, editorId, JSON.stringify({ version: expense.version })],
    );
  });
  await publishMoney(tx, expense.crewId, MONEY_RT.expenseDeleted, {
    expense_id: expense.id,
    trip_id: expense.tripId,
  });
  await publishMoney(tx, expense.crewId, MONEY_RT.balancesUpdated, { crew_id: expense.crewId });
  await emitEvent(tx, {
    type: 'expense.deleted',
    aggregateKind: 'expense',
    aggregateId: expense.id,
    actorKind: 'user',
    actorId: editorId,
    crewId: expense.crewId,
    tripId: expense.tripId,
    payload: { trip_id: expense.tripId, crew_id: expense.crewId, expense_id: expense.id },
  });
  await reissueStaleRequests(tx, expense.crewId, expense.tripId, expense.crewCurrency);
  return { expense_id: expense.id, version };
}
