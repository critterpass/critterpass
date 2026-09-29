/**
 * Crew yearly (docs/product-decisions.md §3 "Products and codes"): an auto-renewing subscription
 * bound at purchase to the crew whose trip lock it was bought under. Its grant follows the
 * subscription (renewals extend it, a failed renewal keeps it through the server grace, a refund
 * ends it); the buyer has Pass+ everywhere and every trip of the crew is boosted. A split crew
 * yearly writes IOUs for the first purchase only; renewals are the buyer's. The buyer may rebind
 * the grant to another of their crews once per period.
 */
import { emitEvent } from '@cp/db';
import type pg from 'pg';

import { recomputeTrip } from '../entitlements';
import { closeIntent } from './activate-boost';
import { writeBoostSplit } from './boost-split';
import { reverseUnsettledIous } from './boost-revoke';
import type { FulfilOutcome, StoredSubscription } from './fulfilment';

interface GrantRow {
  readonly id: string;
  readonly crew_id: string;
  readonly intent_id: string | null;
  readonly split_expense_id: string | null;
  readonly valid_to: Date;
  readonly revoked_at: Date | null;
}

/** Until when the grant covers the crew, for a subscription in this state. */
function accessEnd(sub: StoredSubscription, now: Date): Date {
  const periodEnd = sub.periodEnd ?? now;
  switch (sub.status) {
    case 'active':
    case 'cancelled_active':
      return periodEnd;
    case 'grace':
    case 'billing_retry':
    case 'on_hold':
      return sub.graceEndsAt !== null && sub.graceEndsAt > periodEnd ? sub.graceEndsAt : periodEnd;
    case 'revoked':
      return now;
    case 'paused':
    case 'expired':
      return periodEnd < now ? periodEnd : now;
  }
}

/** Every trip of the crew whose boost state a grant change can move. */
export async function recomputeCrewTrips(tx: pg.PoolClient, crewId: string, now: Date) {
  const { rows } = await tx.query<{ id: string }>(
    "SELECT id FROM trips WHERE crew_id = $1 AND status NOT IN ('archived', 'cancelled')",
    [crewId],
  );
  for (const trip of rows) await recomputeTrip(tx, trip.id, { now: () => now });
}

async function firstPurchasePrice(tx: pg.PoolClient, subscriptionId: string) {
  const { rows } = await tx.query<{
    price_minor: string | null;
    currency: string | null;
    purchased_at: Date;
  }>(
    `SELECT price_minor::text, currency, purchased_at FROM store_transactions
      WHERE subscription_id = $1 ORDER BY purchased_at, created_at LIMIT 1`,
    [subscriptionId],
  );
  const first = rows[0];
  if (first?.price_minor == null || first.currency === null) return undefined;
  return {
    amountMinor: BigInt(first.price_minor),
    currency: first.currency,
    purchasedAt: first.purchased_at,
  };
}

async function ensureFirstSplit(tx: pg.PoolClient, grant: GrantRow, sub: StoredSubscription) {
  if (grant.split_expense_id !== null || grant.intent_id === null) return;
  const { rows } = await tx.query<{
    trip_id: string;
    split_mode: string;
    split_member_ids: string[];
  }>('SELECT trip_id, split_mode, split_member_ids FROM boost_intents WHERE id = $1', [
    grant.intent_id,
  ]);
  const intent = rows[0];
  const charged = await firstPurchasePrice(tx, sub.id);
  if (intent?.split_mode !== 'split' || charged === undefined) return;
  await tx.query('SAVEPOINT crew_year_split');
  try {
    const expenseId = await writeBoostSplit(
      tx,
      {
        id: null,
        tripId: intent.trip_id,
        crewId: grant.crew_id,
        buyerId: sub.userId,
        memberIds: intent.split_member_ids,
      },
      charged,
    );
    await tx.query('UPDATE crew_year_grants SET split_expense_id = $2 WHERE id = $1', [
      grant.id,
      expenseId,
    ]);
    await tx.query('RELEASE SAVEPOINT crew_year_split');
  } catch {
    // No FX rate yet: the reconcile retries; the grant itself is already in force.
    await tx.query('ROLLBACK TO SAVEPOINT crew_year_split');
  }
}

/** The `crew_year` subscription handler (runs as the server). */
export async function crewYearChanged(
  tx: pg.PoolClient,
  sub: StoredSubscription,
  now: Date,
): Promise<FulfilOutcome> {
  const validTo = accessEnd(sub, now);
  const { rows } = await tx.query<GrantRow>(
    `SELECT id, crew_id, intent_id, split_expense_id, valid_to, revoked_at FROM crew_year_grants
      WHERE subscription_id = $1 FOR UPDATE`,
    [sub.id],
  );
  let grant = rows[0];
  if (grant === undefined) {
    const { rows: intents } = await tx.query<{
      id: string;
      trip_id: string;
      crew_id: string;
      buyer_id: string;
      status: string;
    }>(
      `SELECT id, trip_id, crew_id, buyer_id, status FROM boost_intents
        WHERE buyer_id = $1 AND product_key = 'boost_crew_year'
          AND ($2::uuid IS NULL OR id = $2::uuid)
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [sub.userId, sub.intentId],
    );
    const intent = intents[0];
    // A crew yearly nobody bound to a crew stays a plain Pass+ for its buyer until it is bound.
    if (intent === undefined || sub.status === 'revoked' || validTo <= now)
      return { users: [sub.userId] };
    const inserted = await tx.query<GrantRow>(
      `INSERT INTO crew_year_grants (crew_id, buyer_id, subscription_id, original_transaction_id,
         intent_id, valid_from, valid_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, crew_id, intent_id, split_expense_id, valid_to, revoked_at`,
      [
        intent.crew_id,
        sub.userId,
        sub.id,
        sub.originalTransactionId,
        intent.id,
        sub.periodStart ?? now,
        validTo,
      ],
    );
    grant = inserted.rows[0];
    if (grant === undefined) throw new Error('crew year grant insert returned no row');
    if (intent.status === 'open' || intent.status === 'purchasing')
      await closeIntent(tx, intent, 'fulfilled');
    else await tx.query("UPDATE boost_intents SET status = 'fulfilled' WHERE id = $1", [intent.id]);
    await emitEvent(tx, {
      type: 'crew_year.granted',
      aggregateKind: 'crew_year_grant',
      aggregateId: grant.id,
      actorKind: 'user',
      actorId: sub.userId,
      crewId: grant.crew_id,
      payload: { crew_id: grant.crew_id, grant_id: grant.id, buyer_id: sub.userId },
    });
  } else {
    await tx.query(
      `UPDATE crew_year_grants SET valid_to = greatest($2, valid_from + interval '1 second'),
         revoked_at = CASE WHEN $3 THEN coalesce(revoked_at, $4) ELSE revoked_at END
       WHERE id = $1`,
      [grant.id, validTo, sub.status === 'revoked', now],
    );
  }
  if (sub.status === 'revoked') {
    if (grant.split_expense_id !== null) await reverseUnsettledIous(tx, grant.split_expense_id);
  } else {
    await ensureFirstSplit(tx, grant, sub);
  }
  await recomputeCrewTrips(tx, grant.crew_id, now);
  return { users: [sub.userId] };
}
