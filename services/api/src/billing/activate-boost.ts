/**
 * A Trip Boost purchase becomes a boost (docs/system-architecture.md §7.d), in the transaction
 * that verified it: the boost row on the trip its intent locked, the intent fulfilled and its lock
 * released, the split's expense and IOUs when the price the store charged is known, the trip's
 * entitlements recomputed and the crew told. Idempotent per store transaction: a purchase seen
 * again finds its boost (and adds a split that could not be written before). A purchase with no
 * lock to match, or for a trip already boosted, becomes a boost credit the buyer can apply.
 */
import { cancelScheduledEvent, emitEvent, scheduleEvent } from '@cp/db';
import {
  BILLING_QUEUES,
  DomainError,
  type BoostCreditReason,
  type BoostSplitMode,
} from '@cp/domain';
import type pg from 'pg';

import { recomputeTrip } from '../entitlements';
import { writeBoostSplit } from './boost-split';
import { publishBoostState, publishIntentLock } from './boost-rt';
import type { FulfilOutcome, StoredTransaction } from './fulfilment';

interface IntentRow {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly buyer_id: string;
  readonly split_mode: BoostSplitMode;
  readonly split_member_ids: string[];
  readonly status: string;
}

interface BoostRow {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly buyer_id: string;
  readonly split_mode: BoostSplitMode;
  readonly split_member_ids: string[];
  readonly expense_id: string | null;
}

const INTENT_COLUMNS = 'id, trip_id, crew_id, buyer_id, split_mode, split_member_ids, status';

/** The intent a purchase was made under: the one it names, else the buyer's latest open lock. */
async function intentFor(
  tx: pg.PoolClient,
  txn: StoredTransaction,
): Promise<IntentRow | undefined> {
  if (txn.boostIntentId !== null) {
    const { rows } = await tx.query<IntentRow>(
      `SELECT ${INTENT_COLUMNS} FROM boost_intents WHERE id = $1 FOR UPDATE`,
      [txn.boostIntentId],
    );
    return rows[0];
  }
  const { rows } = await tx.query<IntentRow>(
    `SELECT ${INTENT_COLUMNS} FROM boost_intents
      WHERE buyer_id = $1 AND product_key = 'boost_trip' AND status IN ('open', 'purchasing', 'expired')
        AND created_at BETWEEN $2::timestamptz - interval '24 hours' AND $2::timestamptz
        AND NOT EXISTS (SELECT 1 FROM trip_boosts b WHERE b.intent_id = boost_intents.id)
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [txn.userId, txn.purchasedAt],
  );
  const found = rows[0];
  if (found !== undefined) {
    await tx.query('UPDATE store_transactions SET boost_intent_id = $2 WHERE id = $1', [
      txn.id,
      found.id,
    ]);
  }
  return found;
}

async function credit(
  tx: pg.PoolClient,
  txn: StoredTransaction,
  reason: BoostCreditReason,
  crewId: string | null,
): Promise<FulfilOutcome> {
  await tx.query(
    `INSERT INTO boost_credits (crew_id, user_id, reason, store_transaction_id)
     VALUES ($1, $2, $3, $4) ON CONFLICT (store_transaction_id) WHERE store_transaction_id IS NOT NULL
     DO NOTHING`,
    [crewId, txn.userId, reason, txn.id],
  );
  return { boostId: null };
}

/** Adds the split once the charged price is known (no-op for a covered boost or a done split). */
async function ensureSplit(tx: pg.PoolClient, boost: BoostRow, txn: StoredTransaction) {
  if (boost.split_mode !== 'split' || boost.expense_id !== null) return;
  if (txn.priceMinor === null || txn.currency === null) return;
  await tx.query('SAVEPOINT boost_split');
  try {
    await writeBoostSplit(
      tx,
      {
        id: boost.id,
        tripId: boost.trip_id,
        crewId: boost.crew_id,
        buyerId: boost.buyer_id,
        memberIds: boost.split_member_ids,
      },
      { amountMinor: txn.priceMinor, currency: txn.currency, purchasedAt: txn.purchasedAt },
    );
    await tx.query('RELEASE SAVEPOINT boost_split');
  } catch (error) {
    // The boost stays active; the nightly reconcile retries the split once the rate exists.
    if (!(error instanceof DomainError) || error.code !== 'VALIDATION') throw error;
    await tx.query('ROLLBACK TO SAVEPOINT boost_split');
  }
}

/** Arms the boost's expiry at the end of its window (re-armed whenever the window moves). */
export async function armBoostExpiry(tx: pg.PoolClient, boostId: string, endsAt: Date) {
  await scheduleEvent(tx, {
    kind: BILLING_QUEUES.boostExpire,
    refId: boostId,
    tz: 'UTC',
    at: endsAt,
  });
}

/** Closes an intent's lock, telling the trip. */
export async function closeIntent(
  tx: pg.PoolClient,
  intent: { id: string; trip_id: string; crew_id: string; buyer_id: string },
  status: 'fulfilled' | 'expired' | 'cancelled',
): Promise<void> {
  await tx.query('UPDATE boost_intents SET status = $2 WHERE id = $1', [intent.id, status]);
  await cancelScheduledEvent(tx, { kind: BILLING_QUEUES.intentExpiry, refId: intent.id });
  await publishIntentLock(tx, intent.trip_id, {
    intentId: intent.id,
    byUid: intent.buyer_id,
    until: null,
  });
  await emitEvent(tx, {
    type: 'boost.intent_released',
    aggregateKind: 'boost_intent',
    aggregateId: intent.id,
    actorKind: 'system',
    actorId: null,
    crewId: intent.crew_id,
    tripId: intent.trip_id,
    payload: {
      trip_id: intent.trip_id,
      crew_id: intent.crew_id,
      intent_id: intent.id,
      reason: status === 'cancelled' ? 'released' : status,
    },
  });
}

/** The `boost_trip` purchase handler (runs as the server). */
export async function activateBoostPurchase(
  tx: pg.PoolClient,
  txn: StoredTransaction,
  now: Date,
): Promise<FulfilOutcome> {
  const { rows: existing } = await tx.query<BoostRow>(
    `SELECT id, trip_id, crew_id, buyer_id, split_mode, split_member_ids, expense_id
       FROM trip_boosts WHERE store_transaction_id = $1 AND moved_from_boost_id IS NULL`,
    [txn.id],
  );
  if (existing[0] !== undefined) {
    await ensureSplit(tx, existing[0], txn);
    return { boostId: existing[0].id };
  }
  const credited = await tx.query('SELECT 1 FROM boost_credits WHERE store_transaction_id = $1', [
    txn.id,
  ]);
  if ((credited.rowCount ?? 0) > 0) return { boostId: null };

  const intent = await intentFor(tx, txn);
  if (intent === undefined) return credit(tx, txn, 'unassigned', null);
  await tx.query('SELECT 1 FROM trips WHERE id = $1 FOR UPDATE', [intent.trip_id]);
  const live = await tx.query(
    "SELECT 1 FROM trip_boosts WHERE trip_id = $1 AND status IN ('scheduled', 'active')",
    [intent.trip_id],
  );
  if ((live.rowCount ?? 0) > 0) {
    if (intent.status === 'open' || intent.status === 'purchasing') {
      await closeIntent(tx, intent, 'cancelled');
    }
    return credit(tx, txn, 'duplicate_purchase', intent.crew_id);
  }
  const { rows } = await tx.query<BoostRow & { ends_at: Date }>(
    `INSERT INTO trip_boosts (trip_id, crew_id, buyer_id, source, store_transaction_id, intent_id,
       split_mode, split_member_ids, starts_at, ends_at, status)
     VALUES ($1, $2, $3, 'purchase', $4, $5, $6, $7, $8,
       greatest(app.boost_window_end($1, $8), $8 + interval '1 day'), 'active')
     RETURNING id, trip_id, crew_id, buyer_id, split_mode, split_member_ids, expense_id, ends_at`,
    [
      intent.trip_id,
      intent.crew_id,
      intent.buyer_id,
      txn.id,
      intent.id,
      intent.split_mode,
      intent.split_member_ids,
      now,
    ],
  );
  const boost = rows[0];
  if (boost === undefined) throw new Error('trip boost insert returned no row');
  if (intent.status === 'open' || intent.status === 'purchasing') {
    await closeIntent(tx, intent, 'fulfilled');
  } else {
    await tx.query("UPDATE boost_intents SET status = 'fulfilled' WHERE id = $1", [intent.id]);
  }
  await armBoostExpiry(tx, boost.id, boost.ends_at);
  await ensureSplit(tx, boost, txn);
  await publishBoostState(
    tx,
    { id: boost.id, tripId: boost.trip_id, crewId: boost.crew_id },
    'active',
  );
  await emitEvent(tx, {
    type: 'boost.activated',
    aggregateKind: 'trip_boost',
    aggregateId: boost.id,
    actorKind: 'user',
    actorId: boost.buyer_id,
    crewId: boost.crew_id,
    tripId: boost.trip_id,
    payload: {
      trip_id: boost.trip_id,
      crew_id: boost.crew_id,
      boost_id: boost.id,
      buyer_id: boost.buyer_id,
      source: 'purchase',
      split: boost.split_mode === 'split',
    },
  });
  await recomputeTrip(tx, boost.trip_id, { now: () => now });
  return { boostId: boost.id };
}
