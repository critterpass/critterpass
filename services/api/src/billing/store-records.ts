/**
 * The store's side of our records: one `store_transactions` row per store transaction, one
 * `subscriptions` row per store product and account. Every write is an idempotent upsert, so the
 * same purchase reported by the webhook, the app and the reconcile lands once. A transaction
 * already bound to another Critterpass account is never rebound (restores do not transfer).
 */
import { emitEvent } from '@cp/db';
import {
  storeIdsSchema,
  type ProductKey,
  type StorePlatform,
  type SubscriptionState,
} from '@cp/domain';
import type pg from 'pg';

import type { StoredSubscription, StoredTransaction } from './fulfilment';
import type { MappedSubscription, ProductCatalogueEntry } from './map-subscriber';
import { resumeAtAfterSync } from './pause-intent';

export interface TransactionFacts {
  readonly platform: StorePlatform;
  readonly transactionId: string;
  readonly originalTransactionId: string | null;
  readonly storeProductId: string;
  readonly productKey: ProductKey;
  readonly purchasedAt: Date;
  readonly environment: 'production' | 'sandbox';
  readonly subscriptionId: string | null;
  readonly price: { readonly amountMinor: bigint; readonly currency: string } | null;
  readonly storefront: string | null;
  readonly offerCode: string | null;
  readonly intentId: string | null;
}

interface TransactionRow {
  readonly id: string;
  readonly user_id: string | null;
  readonly platform: StorePlatform;
  readonly transaction_id: string;
  readonly product_key: string;
  readonly purchased_at: Date;
  readonly price_minor: string | null;
  readonly currency: string | null;
  readonly boost_intent_id: string | null;
  readonly revoked_at: Date | null;
}

export function toStoredTransaction(row: TransactionRow, uid: string): StoredTransaction {
  return {
    id: row.id,
    userId: row.user_id ?? uid,
    platform: row.platform,
    transactionId: row.transaction_id,
    productKey: row.product_key,
    purchasedAt: row.purchased_at,
    priceMinor: row.price_minor === null ? null : BigInt(row.price_minor),
    currency: row.currency,
    boostIntentId: row.boost_intent_id,
  };
}

const TRANSACTION_COLUMNS = `id, user_id, platform, transaction_id, product_key, purchased_at,
  price_minor::text AS price_minor, currency, boost_intent_id, revoked_at`;

export interface RecordedTransaction {
  readonly row: StoredTransaction;
  readonly revoked: boolean;
  /** The transaction belongs to another account; nothing about it changed. */
  readonly ownedByOther: boolean;
}

/** Records a store transaction for `uid`, filling what we did not know before (price, intent). */
export async function recordTransaction(
  tx: pg.PoolClient,
  uid: string,
  facts: TransactionFacts,
): Promise<RecordedTransaction> {
  const { rows } = await tx.query<TransactionRow>(
    `INSERT INTO store_transactions (user_id, platform, transaction_id, original_transaction_id,
       subscription_id, product_key, store_product_id, purchased_at, price_minor, currency,
       storefront, environment, offer_code, boost_intent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (platform, transaction_id) DO UPDATE SET
       original_transaction_id = coalesce(store_transactions.original_transaction_id,
         EXCLUDED.original_transaction_id),
       subscription_id = coalesce(store_transactions.subscription_id, EXCLUDED.subscription_id),
       price_minor = coalesce(store_transactions.price_minor, EXCLUDED.price_minor),
       currency = coalesce(store_transactions.currency, EXCLUDED.currency),
       storefront = coalesce(store_transactions.storefront, EXCLUDED.storefront),
       offer_code = coalesce(store_transactions.offer_code, EXCLUDED.offer_code),
       boost_intent_id = coalesce(store_transactions.boost_intent_id, EXCLUDED.boost_intent_id)
     WHERE store_transactions.user_id = EXCLUDED.user_id
     RETURNING ${TRANSACTION_COLUMNS}`,
    [
      uid,
      facts.platform,
      facts.transactionId,
      facts.originalTransactionId,
      facts.subscriptionId,
      facts.productKey,
      facts.storeProductId,
      facts.purchasedAt,
      facts.price?.amountMinor.toString() ?? null,
      facts.price?.currency ?? null,
      facts.storefront,
      facts.environment,
      facts.offerCode,
      facts.intentId,
    ],
  );
  const row = rows[0];
  if (row !== undefined) {
    return {
      row: toStoredTransaction(row, uid),
      revoked: row.revoked_at !== null,
      ownedByOther: false,
    };
  }
  // The conflict row belongs to someone else (the WHERE refused the update).
  const existing = await tx.query<TransactionRow>(
    `SELECT ${TRANSACTION_COLUMNS} FROM store_transactions WHERE platform = $1 AND transaction_id = $2`,
    [facts.platform, facts.transactionId],
  );
  const other = existing.rows[0];
  if (other === undefined) throw new Error('store transaction vanished during upsert');
  return {
    row: toStoredTransaction(other, uid),
    revoked: other.revoked_at !== null,
    ownedByOther: true,
  };
}

/** Stamps a refund or revocation once; `undefined` when the transaction is unknown. */
export async function stampRevoked(
  tx: pg.PoolClient,
  platform: StorePlatform,
  transactionId: string,
  reason: 'refund' | 'revoke',
  now: Date,
): Promise<{ row: StoredTransaction; newly: boolean } | undefined> {
  const { rows } = await tx.query<TransactionRow>(
    `SELECT ${TRANSACTION_COLUMNS} FROM store_transactions
      WHERE platform = $1 AND transaction_id = $2 FOR UPDATE`,
    [platform, transactionId],
  );
  const row = rows[0];
  if (row === undefined) return undefined;
  const stored = toStoredTransaction(row, row.user_id ?? '');
  if (row.revoked_at !== null) return { row: stored, newly: false };
  await tx.query(
    `UPDATE store_transactions SET revoked_at = $2, revocation_reason = $3,
       refunded_at = CASE WHEN $3 = 'refund' THEN $2 ELSE refunded_at END
     WHERE id = $1`,
    [row.id, now, reason],
  );
  return { row: stored, newly: true };
}

interface SubscriptionRow {
  readonly id: string;
  readonly status: SubscriptionState;
  readonly auto_renew: boolean;
  readonly period_start: Date | null;
  readonly period_end: Date | null;
  readonly grace_ends_at: Date | null;
  readonly resume_at: Date | null;
  readonly original_transaction_id: string | null;
}

const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * Brings `uid`'s row for one store subscription in line with RevenueCat; `changed` when anything
 * the entitlement engine reads moved. Emits `subscription.changed` on a status change.
 */
export async function upsertSubscription(
  tx: pg.PoolClient,
  uid: string,
  mapped: MappedSubscription,
  originalTransactionId: string | null,
): Promise<{ subscription: StoredSubscription; changed: boolean }> {
  const { rows } = await tx.query<SubscriptionRow>(
    `SELECT id, status, auto_renew, period_start, period_end, grace_ends_at, resume_at,
            original_transaction_id
       FROM subscriptions WHERE user_id = $1 AND platform = $2 AND product_key = $3 FOR UPDATE`,
    [uid, mapped.platform, mapped.productKey],
  );
  const existing = rows[0];
  const otx =
    originalTransactionId ?? existing?.original_transaction_id ?? mapped.latestTransactionId;
  const values = [
    mapped.status,
    mapped.autoRenew,
    mapped.periodStart,
    mapped.periodEnd,
    mapped.graceEndsAt,
    mapped.pausedFrom,
    // The member's own planned resume date outlives a sync that knows nothing about it.
    resumeAtAfterSync(
      existing === undefined
        ? undefined
        : { autoRenew: existing.auto_renew, resumeAt: existing.resume_at },
      mapped,
    ),
    mapped.environment,
    otx,
  ];
  let id: string;
  if (existing === undefined) {
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO subscriptions (status, auto_renew, period_start, period_end, grace_ends_at,
         paused_from, resume_at, environment, original_transaction_id, user_id, platform,
         product_key, rc_customer_id, last_event_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid, $11, $12, $10::text, now())
       RETURNING id`,
      [...values, uid, mapped.platform, mapped.productKey],
    );
    const row = inserted.rows[0];
    if (row === undefined) throw new Error('subscription insert returned no row');
    id = row.id;
  } else {
    id = existing.id;
    await tx.query(
      `UPDATE subscriptions SET status = $1, auto_renew = $2, period_start = $3, period_end = $4,
         grace_ends_at = $5, paused_from = $6, resume_at = $7, environment = $8,
         original_transaction_id = $9, last_event_at = now()
       WHERE id = $10`,
      [...values, id],
    );
  }
  const changed =
    existing === undefined ||
    existing.status !== mapped.status ||
    existing.auto_renew !== mapped.autoRenew ||
    !same(existing.period_end, mapped.periodEnd) ||
    !same(existing.grace_ends_at, mapped.graceEndsAt);
  if (existing === undefined || existing.status !== mapped.status) {
    await emitEvent(tx, {
      type: 'subscription.changed',
      aggregateKind: 'subscription',
      aggregateId: id,
      actorKind: 'system',
      actorId: null,
      payload: {
        user_id: uid,
        subscription_id: id,
        product_key: mapped.productKey,
        status: mapped.status,
        previous_status: existing?.status ?? null,
      },
    });
  }
  return {
    subscription: {
      id,
      userId: uid,
      productKey: mapped.productKey,
      status: mapped.status,
      previousStatus: existing?.status ?? null,
      periodStart: mapped.periodStart,
      periodEnd: mapped.periodEnd,
      graceEndsAt: mapped.graceEndsAt,
      originalTransactionId: otx,
      intentId: null,
    },
    changed,
  };
}

/** Store rows RevenueCat no longer lists for this customer have lapsed. */
export async function expireUnlisted(
  tx: pg.PoolClient,
  uid: string,
  listed: readonly { platform: StorePlatform; productKey: ProductKey }[],
): Promise<number> {
  const keys = listed.map((entry) => `${entry.platform}:${entry.productKey}`);
  const { rowCount } = await tx.query(
    `UPDATE subscriptions SET status = 'expired', auto_renew = false, grace_ends_at = NULL,
       last_event_at = now()
     WHERE user_id = $1 AND platform IN ('app_store', 'play')
       AND status NOT IN ('expired', 'revoked')
       AND NOT (platform || ':' || product_key = ANY ($2::text[]))`,
    [uid, keys],
  );
  return rowCount ?? 0;
}

/** The product catalogue with each product's store ids (`products` is readable by every role). */
export async function loadCatalogue(tx: pg.PoolClient): Promise<ProductCatalogueEntry[]> {
  const { rows } = await tx.query<{ key: ProductKey; store_ids: unknown }>(
    'SELECT key, store_ids FROM products',
  );
  return rows.map((row) => ({ key: row.key, storeIds: storeIdsSchema.parse(row.store_ids ?? {}) }));
}
