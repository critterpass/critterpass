/**
 * A refunded or revoked boost purchase (docs/product-decisions.md §3 lifecycle overlays): every
 * boost it paid for is revoked, wherever it moved, its unspent credits are withdrawn, and the IOUs
 * of its split that nobody has paid yet are reversed. IOUs already settled stay settled: there is
 * no money movement in the app to undo.
 */
import { reverseEntries, type StoredLedgerEntry } from '@cp/cost-engine';
import { emitEvent } from '@cp/db';
import { MONEY_RT, type RevocationReason } from '@cp/domain';
import type pg from 'pg';

import { publishMoney } from '../commands/money/shared';
import { recomputeTrip } from '../entitlements';
import { writeLedgerEntries } from '../money/ledger';
import { BOOST_COLUMNS, type BoostRow } from './boost-lifecycle';
import { publishBoostState } from './boost-rt';
import type { FulfilOutcome, StoredTransaction } from './fulfilment';

/** Every boost a purchase paid for: the first, and each one it moved or was credited into. */
async function boostChain(tx: pg.PoolClient, transactionId: string): Promise<string[]> {
  const seen = new Set<string>();
  let frontier = (
    await tx.query<{ id: string }>(
      `SELECT id FROM trip_boosts WHERE store_transaction_id = $1
       UNION SELECT consumed_by_boost_id FROM boost_credits
        WHERE store_transaction_id = $1 AND consumed_by_boost_id IS NOT NULL`,
      [transactionId],
    )
  ).rows.map((row) => row.id);
  while (frontier.length > 0) {
    for (const id of frontier) seen.add(id);
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM trip_boosts WHERE moved_from_boost_id = ANY ($1::uuid[])
       UNION SELECT consumed_by_boost_id FROM boost_credits
        WHERE from_boost_id = ANY ($1::uuid[]) AND consumed_by_boost_id IS NOT NULL`,
      [frontier],
    );
    frontier = rows.map((row) => row.id).filter((id) => !seen.has(id));
  }
  return [...seen];
}

interface IouRow {
  readonly id: string;
  readonly crew_id: string;
  readonly trip_id: string | null;
  readonly debtor_id: string;
  readonly creditor_id: string;
  readonly amount_minor: string;
  readonly currency: string;
  readonly source_id: string;
  readonly paid: string;
}

/** Reverses the IOUs of `expenseId` that their debtor has not paid the buyer since. */
export async function reverseUnsettledIous(tx: pg.PoolClient, expenseId: string): Promise<number> {
  const { rows } = await tx.query<IouRow>(
    `SELECT e.id, e.crew_id, e.trip_id, e.debtor_id, e.creditor_id, e.amount_minor::text,
            e.currency, e.source_id,
            (SELECT coalesce(sum(p.amount_minor), 0)::text FROM payments p
              WHERE p.crew_id = e.crew_id AND p.from_id = e.debtor_id AND p.to_id = e.creditor_id
                AND p.currency = e.currency AND p.status = 'confirmed'
                AND p.confirmed_at >= e.created_at) AS paid
       FROM ledger_entries e
      WHERE e.source_kind = 'boost_iou' AND e.source_id = $1
        AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_id = e.id)`,
    [expenseId],
  );
  const unsettled: StoredLedgerEntry[] = rows
    .filter((row) => BigInt(row.paid) < BigInt(row.amount_minor))
    .map((row) => ({
      id: row.id,
      crewId: row.crew_id,
      tripId: row.trip_id,
      debtorId: row.debtor_id,
      creditorId: row.creditor_id,
      amountMinor: BigInt(row.amount_minor),
      currency: row.currency,
      sourceKind: 'boost_iou',
      sourceId: row.source_id,
      reversesId: null,
    }));
  await writeLedgerEntries(tx, reverseEntries(unsettled));
  const crewId = rows[0]?.crew_id;
  if (crewId !== undefined && unsettled.length > 0) {
    await publishMoney(tx, crewId, MONEY_RT.balancesUpdated, { crew_id: crewId });
  }
  return unsettled.length;
}

/** Revokes one boost (any live or ended status) and reverses its split's unpaid IOUs. */
export async function revokeBoost(
  tx: pg.PoolClient,
  boost: BoostRow & { readonly expense_id: string | null },
  reason: RevocationReason,
  now: Date,
): Promise<void> {
  if (boost.status === 'scheduled' || boost.status === 'active' || boost.status === 'ended') {
    await tx.query(
      "UPDATE trip_boosts SET status = 'revoked', revoked_at = $2, revoke_reason = $3 WHERE id = $1",
      [boost.id, now, reason],
    );
    await publishBoostState(
      tx,
      { id: boost.id, tripId: boost.trip_id, crewId: boost.crew_id },
      'revoked',
    );
    await emitEvent(tx, {
      type: 'boost.revoked',
      aggregateKind: 'trip_boost',
      aggregateId: boost.id,
      actorKind: 'system',
      actorId: null,
      crewId: boost.crew_id,
      tripId: boost.trip_id,
      payload: { trip_id: boost.trip_id, crew_id: boost.crew_id, boost_id: boost.id, reason },
    });
    await recomputeTrip(tx, boost.trip_id, { now: () => now });
  }
  if (boost.expense_id !== null) await reverseUnsettledIous(tx, boost.expense_id);
}

/** The `boost_trip` refund handler (runs as the server). */
export async function revokeBoostPurchase(
  tx: pg.PoolClient,
  txn: StoredTransaction,
  reason: RevocationReason,
  now: Date,
): Promise<FulfilOutcome> {
  const ids = await boostChain(tx, txn.id);
  const { rows } = await tx.query<BoostRow & { expense_id: string | null }>(
    `SELECT ${BOOST_COLUMNS}, expense_id FROM trip_boosts WHERE id = ANY ($1::uuid[]) FOR UPDATE`,
    [ids],
  );
  for (const boost of rows) await revokeBoost(tx, boost, reason, now);
  await tx.query(
    `UPDATE boost_credits SET revoked_at = $3
      WHERE (store_transaction_id = $1 OR from_boost_id = ANY ($2::uuid[]))
        AND consumed_at IS NULL AND revoked_at IS NULL`,
    [txn.id, ids, now],
  );
  return { boostId: rows[0]?.id ?? null };
}
