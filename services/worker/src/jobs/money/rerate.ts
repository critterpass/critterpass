/**
 * `money.rerate` (docs/api-contracts-async.md §2.2): after an organiser changes the crew's
 * settlement currency, every live expense is re-expressed in it (its own FX run when that run
 * relates the two currencies, else the newest run that does): old entries reversed, new ones
 * derived from the stored shares, the shares' crew amounts rewritten. Confirmed payments' entries
 * move the same way; requests not yet paid are cancelled (the settle plan is recomputed) and
 * payments already marked paid or disputed are restated in the new currency. Re-running is a no-op:
 * anything already in the currency is skipped.
 */
import {
  convertWith,
  deriveEntries,
  money,
  paymentEntry,
  reverseEntries,
  toCrewShares,
  type FxContext,
} from '@cp/cost-engine';
import { outbox, withSystem } from '@cp/db';
import { channelName, MONEY_QUEUES, MONEY_RT } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import { appendLedgerEntries, fxRun, unreversedEntries } from './ledger-db';

export const rerateSchema = z.object({ crew_id: z.uuid() });
export type RerateJob = z.infer<typeof rerateSchema>;

export interface RerateOutcome {
  readonly currency: string;
  readonly expenses: number;
  readonly payments: number;
  readonly cancelled: number;
}

/** A run relating the two currencies: the pinned one when it does, else the newest. */
async function runFor(
  tx: pg.PoolClient,
  pinned: string | null,
  from: string,
  to: string,
  sample: bigint,
): Promise<FxContext | undefined> {
  if (pinned !== null) {
    const run = await fxRun(tx, pinned, from, to);
    try {
      convertWith(money(sample, from), to, run);
      return run;
    } catch {
      // The pinned run lacks the new currency; fall through to the newest run that has both.
    }
  }
  return fxRun(tx, null, from, to);
}

export async function rerateCrew(pool: pg.Pool, crewId: string): Promise<RerateOutcome> {
  return withSystem(pool, async (tx) => {
    const { rows: crews } = await tx.query<{ currency: string }>(
      "SELECT coalesce(settlement_currency, 'USD') AS currency FROM crews WHERE id = $1 FOR UPDATE",
      [crewId],
    );
    const target = crews[0]?.currency;
    if (target === undefined) return { currency: '', expenses: 0, payments: 0, cancelled: 0 };

    const { rows: expenses } = await tx.query<{
      id: string;
      trip_id: string;
      payer_id: string;
      amount_minor: string;
      currency: string;
      fx_snapshot_id: string | null;
    }>(
      `SELECT id, trip_id, payer_id, amount_minor::text, currency, fx_snapshot_id FROM expenses
        WHERE crew_id = $1 AND deleted_at IS NULL AND crew_currency <> $2
        ORDER BY created_at, id FOR UPDATE`,
      [crewId, target],
    );
    for (const expense of expenses) {
      const amount = BigInt(expense.amount_minor);
      const fx = await runFor(tx, expense.fx_snapshot_id, expense.currency, target, amount);
      const { rows: shares } = await tx.query<{ id: string; user_id: string; computed: string }>(
        `SELECT id, user_id, computed_minor::text AS computed FROM expense_shares
          WHERE expense_id = $1 ORDER BY created_at, id`,
        [expense.id],
      );
      const crew = toCrewShares(
        money(amount, expense.currency),
        shares.map((share) => ({ userId: share.user_id, amountMinor: BigInt(share.computed) })),
        target,
        fx,
        expense.payer_id,
      );
      await appendLedgerEntries(tx, [
        ...reverseEntries(await unreversedEntries(tx, 'expense', expense.id)),
        ...deriveEntries({
          id: expense.id,
          crewId,
          tripId: expense.trip_id,
          payerId: expense.payer_id,
          crewCurrency: target,
          crewShares: crew.shares,
        }),
      ]);
      for (const [index, share] of shares.entries()) {
        await tx.query('UPDATE expense_shares SET crew_computed_minor = $2 WHERE id = $1', [
          share.id,
          (crew.shares[index]?.amountMinor ?? 0n).toString(),
        ]);
      }
      await tx.query(
        `UPDATE expenses SET crew_currency = $2, crew_amount_minor = $3, fx_snapshot_id = $4,
           version = version + 1 WHERE id = $1`,
        [
          expense.id,
          target,
          crew.total.amountMinor.toString(),
          expense.currency === target ? null : (fx?.snapshotId ?? null),
        ],
      );
    }

    const { rows: confirmed } = await tx.query<{
      id: string;
      trip_id: string | null;
      from_id: string;
      to_id: string;
    }>(
      `SELECT DISTINCT p.id, p.trip_id, p.from_id, p.to_id FROM payments p
         JOIN ledger_entries e ON e.source_kind = 'payment' AND e.source_id = p.id
        WHERE p.crew_id = $1 AND p.status = 'confirmed' AND e.currency <> $2
          AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_id = e.id)`,
      [crewId, target],
    );
    for (const payment of confirmed) {
      const live = await unreversedEntries(tx, 'payment', payment.id);
      const moved = live[0];
      if (moved === undefined) continue;
      const fx = await runFor(tx, null, moved.currency, target, moved.amountMinor);
      const amount = convertWith(money(moved.amountMinor, moved.currency), target, fx);
      await appendLedgerEntries(tx, [
        ...reverseEntries(live),
        ...(amount.amountMinor > 0n
          ? [
              paymentEntry({
                id: payment.id,
                crewId,
                tripId: payment.trip_id,
                fromId: payment.from_id,
                toId: payment.to_id,
                amount,
              }),
            ]
          : []),
      ]);
    }

    const cancelled = await tx.query(
      `UPDATE payments SET status = 'cancelled', version = version + 1
        WHERE crew_id = $1 AND currency <> $2 AND status IN ('pending', 'requested')`,
      [crewId, target],
    );
    const { rows: inFlight } = await tx.query<{
      id: string;
      amount_minor: string;
      currency: string;
    }>(
      `SELECT id, amount_minor::text, currency FROM payments
        WHERE crew_id = $1 AND currency <> $2 AND status IN ('marked_paid', 'disputed')`,
      [crewId, target],
    );
    for (const payment of inFlight) {
      const amount = BigInt(payment.amount_minor);
      const fx = await runFor(tx, null, payment.currency, target, amount);
      const restated = convertWith(money(amount, payment.currency), target, fx);
      await tx.query(
        `UPDATE payments SET amount_minor = greatest($2::bigint, 1), currency = $3,
           version = version + 1 WHERE id = $1`,
        [payment.id, restated.amountMinor.toString(), target],
      );
    }

    await outbox(tx, channelName('crew_money', crewId), MONEY_RT.balancesUpdated, {
      crew_id: crewId,
    });
    return {
      currency: target,
      expenses: expenses.length,
      payments: confirmed.length,
      cancelled: cancelled.rowCount ?? 0,
    };
  });
}

export function rerateJob(): JobDefinition<RerateJob> {
  return defineJob({
    queue: MONEY_QUEUES.rerate,
    schema: rerateSchema,
    singletonKey: (data: RerateJob) => data.crew_id,
    handler: async (data, ctx) => ({ ...(await rerateCrew(ctx.pool, data.crew_id)) }),
  });
}
