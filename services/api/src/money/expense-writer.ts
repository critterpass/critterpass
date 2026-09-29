/**
 * Writing an expense: its shares (exact, in the expense currency), their crew-currency twins at the
 * pinned FX run, the ledger entries, the edit history row, the crew chat card, the realtime hints
 * and the domain event — all in the command's transaction. Changes reverse the expense's live
 * entries and derive new ones; nothing already in the ledger is touched.
 */
import {
  computeExpenseShares,
  deriveEntries,
  money,
  toCrewShares,
  type Share,
} from '@cp/cost-engine';
import { emitEvent, outbox } from '@cp/db';
import {
  channelName,
  DomainError,
  MONEY_RT,
  type ExpenseCategory,
  type ExpenseResult,
  type ExpenseSource,
  type ExpenseSplitInput,
  type ExpenseSplitMode,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { publishMoney } from '../commands/money/shared';
import { loadFxContext, writeLedgerEntries } from './ledger';

export interface ShareRow {
  readonly userId: string;
  readonly weight: number;
  readonly fixedMinor: bigint | null;
  readonly computedMinor: bigint;
}

/** Shares for a keypad split (EVENLY / BY SHARE / CUSTOM) of `amountMinor`. */
export function sharesFromSplit(
  amountMinor: bigint,
  currency: string,
  split: ExpenseSplitInput,
  payerId: string,
): ShareRow[] {
  const shares = computeExpenseShares({
    total: money(amountMinor, currency),
    mode: split.mode,
    payerId,
    members: split.shares.map((share) => ({
      userId: share.user_id,
      ...(share.weight === undefined ? {} : { weight: share.weight }),
      ...(share.fixed_minor === undefined ? {} : { fixedMinor: BigInt(share.fixed_minor) }),
    })),
  });
  return split.shares.map((share, index) => ({
    userId: share.user_id,
    weight: split.mode === 'weights' ? (share.weight ?? 1) : 1,
    fixedMinor: share.fixed_minor === undefined ? null : BigInt(share.fixed_minor),
    computedMinor: shares[index]?.amountMinor ?? 0n,
  }));
}

export interface ExpenseFields {
  readonly id: string;
  readonly crewId: string;
  readonly tripId: string;
  readonly payerId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly fxSnapshotId: string | null;
  readonly crewCurrency: string;
  readonly splitMode: ExpenseSplitMode;
  readonly category: ExpenseCategory;
  readonly description: string;
  readonly merchant: string | null;
  readonly spentAt: Date;
  readonly localDate: string;
  readonly tripDay: number | null;
  readonly shares: readonly ShareRow[];
}

export interface NewExpense extends ExpenseFields {
  readonly createdBy: string;
  readonly source: ExpenseSource;
  readonly poiId: string | null;
  readonly receiptId: string | null;
}

export interface Priced {
  readonly crewAmountMinor: bigint;
  readonly crewShares: readonly Share[];
  readonly fxSnapshotId: string | null;
}

export async function price(tx: pg.PoolClient, fields: ExpenseFields): Promise<Priced> {
  const fx = await loadFxContext(tx, fields.fxSnapshotId, fields.currency, fields.crewCurrency);
  const crew = toCrewShares(
    money(fields.amountMinor, fields.currency),
    fields.shares.map((share) => ({ userId: share.userId, amountMinor: share.computedMinor })),
    fields.crewCurrency,
    fx,
    fields.payerId,
  );
  return {
    crewAmountMinor: crew.total.amountMinor,
    crewShares: crew.shares,
    fxSnapshotId: fx?.snapshotId ?? null,
  };
}

/** What the history keeps of an expense at one moment. */
export function snapshot(fields: ExpenseFields, priced: Priced): Record<string, unknown> {
  return {
    amount_minor: Number(fields.amountMinor),
    currency: fields.currency,
    crew_amount_minor: Number(priced.crewAmountMinor),
    crew_currency: fields.crewCurrency,
    fx_snapshot_id: priced.fxSnapshotId,
    payer_id: fields.payerId,
    split_mode: fields.splitMode,
    category: fields.category,
    description: fields.description,
    merchant: fields.merchant,
    spent_at: fields.spentAt.toISOString(),
    shares: fields.shares.map((share) => ({
      user_id: share.userId,
      computed_minor: Number(share.computedMinor),
    })),
  };
}

export async function writeShares(tx: pg.PoolClient, fields: ExpenseFields, priced: Priced) {
  await tx.query('DELETE FROM expense_shares WHERE expense_id = $1', [fields.id]);
  for (const [index, share] of fields.shares.entries()) {
    await tx.query(
      `INSERT INTO expense_shares (expense_id, trip_id, user_id, weight, fixed_minor, computed_minor,
         crew_computed_minor, excluded_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        fields.id,
        fields.tripId,
        share.userId,
        share.weight,
        share.fixedMinor?.toString() ?? null,
        share.computedMinor.toString(),
        (priced.crewShares[index]?.amountMinor ?? 0n).toString(),
        share.computedMinor === 0n ? 'left_out' : null,
      ],
    );
  }
}

export function entriesFor(fields: ExpenseFields, priced: Priced) {
  return deriveEntries({
    id: fields.id,
    crewId: fields.crewId,
    tripId: fields.tripId,
    payerId: fields.payerId,
    crewCurrency: fields.crewCurrency,
    crewShares: priced.crewShares,
  });
}

export function result(fields: ExpenseFields, priced: Priced, version: number): ExpenseResult {
  return {
    expense_id: fields.id,
    version,
    crew_amount_minor: Number(priced.crewAmountMinor),
    crew_currency: fields.crewCurrency,
  };
}

/** Inserts a new expense with everything that hangs off it. */
export async function createExpense(
  tx: pg.PoolClient,
  expense: NewExpense,
): Promise<ExpenseResult> {
  const priced = await price(tx, expense);
  await asSystemRole(tx, async () => {
    const existing = await tx.query('SELECT 1 FROM expenses WHERE id = $1', [expense.id]);
    if ((existing.rowCount ?? 0) > 0) {
      throw new DomainError('STATE_INVALID', { reason: 'expense_exists' });
    }
    await tx.query(
      `INSERT INTO expenses (id, crew_id, trip_id, payer_id, amount_minor, currency, fx_snapshot_id,
         crew_amount_minor, crew_currency, split_mode, category, description, merchant, local_date,
         trip_day, spent_at, poi_id, receipt_id, source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
         $20)`,
      [
        expense.id,
        expense.crewId,
        expense.tripId,
        expense.payerId,
        expense.amountMinor.toString(),
        expense.currency,
        priced.fxSnapshotId,
        priced.crewAmountMinor.toString(),
        expense.crewCurrency,
        expense.splitMode,
        expense.category,
        expense.description,
        expense.merchant,
        expense.localDate,
        expense.tripDay,
        expense.spentAt,
        expense.poiId,
        expense.receiptId,
        expense.source,
        expense.createdBy,
      ],
    );
    await writeShares(tx, expense, priced);
    await tx.query(
      `INSERT INTO expense_edits (expense_id, trip_id, editor_id, kind, after)
       VALUES ($1, $2, $3, 'created', $4)`,
      [expense.id, expense.tripId, expense.createdBy, JSON.stringify(snapshot(expense, priced))],
    );
    await writeLedgerEntries(tx, entriesFor(expense, priced));
    // The crew chat card ("Maya paid Rp 1.08M for lunch · Split 6 ways"): the chat renders it from
    // the synced expense row it points at.
    const { rows } = await tx.query<{ id: string; seq: string }>(
      `INSERT INTO messages (crew_id, trip_id, sender_kind, sender_id, type, body, ref_kind, ref_id)
       VALUES ($1, $2, 'user', $3, 'expense', $4, 'expense', $5) RETURNING id, seq`,
      [
        expense.crewId,
        expense.tripId,
        expense.createdBy,
        (expense.merchant ?? expense.description).slice(0, 4000),
        expense.id,
      ],
    );
    await outbox(tx, channelName('crew_chat', expense.crewId), 'message.created', {
      crew_id: expense.crewId,
      message_id: rows[0]?.id,
      seq: Number(rows[0]?.seq),
    });
  });
  await publishMoney(tx, expense.crewId, MONEY_RT.expenseAdded, {
    expense_id: expense.id,
    trip_id: expense.tripId,
  });
  await publishMoney(tx, expense.crewId, MONEY_RT.balancesUpdated, { crew_id: expense.crewId });
  await emitEvent(tx, {
    type: 'expense.added',
    aggregateKind: 'expense',
    aggregateId: expense.id,
    actorKind: 'user',
    actorId: expense.createdBy,
    crewId: expense.crewId,
    tripId: expense.tripId,
    payload: {
      trip_id: expense.tripId,
      crew_id: expense.crewId,
      expense_id: expense.id,
      payer_id: expense.payerId,
      source: expense.source,
    },
  });
  return result(expense, priced, 1);
}
