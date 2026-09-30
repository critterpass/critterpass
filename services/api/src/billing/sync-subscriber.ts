/**
 * Applies what RevenueCat says about one customer to our records (docs/api-contracts.md §5.8):
 * each store subscription's state, each store transaction, what each new purchase unlocks, any
 * refund the triggering event reported, and finally the customer's materialised entitlements.
 * Runs as the server inside the caller's transaction; applying the same read twice changes
 * nothing the second time.
 */
import { PRODUCT_ROLES, type ProductKey, type StorePlatform } from '@cp/domain';
import type pg from 'pg';

import { recomputeUser } from '../entitlements';
import { asServer } from './as-server';
import { purchaseHandler, type StoredTransaction } from './fulfilment';
import { mapSubscriber, type ProductCatalogueEntry } from './map-subscriber';
import type { RcSubscriber } from './rc-client';
import {
  expireUnlisted,
  recordTransaction,
  stampRevoked,
  upsertSubscription,
} from './store-records';

/** What the triggering event (or the app) knows that the customer read does not. */
export interface PurchaseFacts {
  readonly platform: StorePlatform;
  readonly transactionId: string;
  readonly originalTransactionId: string | null;
  readonly storeProductId: string;
  readonly price: { readonly amountMinor: bigint; readonly currency: string } | null;
  readonly storefront: string | null;
  readonly offerCode: string | null;
  /** The boost intent the purchase was made under (the subscriber attribute at purchase time). */
  readonly intentId: string | null;
  /** The event reported this transaction refunded or revoked. */
  readonly revoked: 'refund' | 'revoke' | null;
}

export interface SyncOptions {
  readonly now: Date;
  readonly graceDays: number;
  readonly catalogue: readonly ProductCatalogueEntry[];
  readonly facts?: PurchaseFacts | undefined;
}

export interface SyncOutcome {
  /** Subscription rows whose entitlement-relevant state moved (the reconcile's drift count). */
  readonly drifted: number;
  readonly transactions: ReadonlyMap<string, StoredTransaction>;
  /** Transactions RevenueCat lists that another account owns. */
  readonly ownedByOther: readonly string[];
  readonly boostIds: ReadonlyMap<string, string | null>;
  readonly unknownProducts: readonly string[];
  readonly passPlus: boolean;
}

/** A boost intent id is only taken from outside when it is the buyer's own. */
async function ownIntent(tx: pg.PoolClient, uid: string, id: string | null | undefined) {
  if (id === null || id === undefined || !/^[0-9a-f-]{36}$/iu.test(id)) return null;
  const { rows } = await tx.query('SELECT 1 FROM boost_intents WHERE id = $1 AND buyer_id = $2', [
    id,
    uid,
  ]);
  return rows.length > 0 ? id : null;
}

export function syncSubscriber(
  tx: pg.PoolClient,
  uid: string,
  subscriber: RcSubscriber,
  options: SyncOptions,
): Promise<SyncOutcome> {
  return asServer(tx, async () => {
    const { now, facts } = options;
    const mapped = mapSubscriber(subscriber, options);
    const matches = (platform: StorePlatform, transactionId: string) =>
      facts !== undefined && facts.platform === platform && facts.transactionId === transactionId;
    const intentFromFacts = await ownIntent(tx, uid, facts?.intentId);
    const intentFromAttribute = await ownIntent(tx, uid, mapped.attributes['boost_intent_id']);
    const touchedUsers = new Set<string>([uid]);
    const transactions = new Map<string, StoredTransaction>();
    const ownedByOther: string[] = [];
    const boostIds = new Map<string, string | null>();
    let drifted = 0;

    for (const subscription of mapped.subscriptions) {
      const isFactsSub =
        facts !== undefined && facts.storeProductId === subscription.storeProductId;
      const upserted = await upsertSubscription(
        tx,
        uid,
        subscription,
        isFactsSub ? facts.originalTransactionId : null,
      );
      if (upserted.changed) drifted += 1;
      const latest = isFactsSub ? facts.transactionId : subscription.latestTransactionId;
      let intentId: string | null = null;
      if (latest !== null) {
        const recorded = await recordTransaction(tx, uid, {
          platform: subscription.platform,
          transactionId: latest,
          originalTransactionId: upserted.subscription.originalTransactionId,
          storeProductId: subscription.storeProductId,
          productKey: subscription.productKey,
          purchasedAt: subscription.periodStart,
          environment: subscription.environment,
          subscriptionId: upserted.subscription.id,
          price: isFactsSub ? facts.price : null,
          storefront: isFactsSub ? facts.storefront : null,
          offerCode: isFactsSub ? facts.offerCode : null,
          intentId: isFactsSub ? intentFromFacts : intentFromAttribute,
        });
        if (recorded.ownedByOther) {
          ownedByOther.push(latest);
          continue;
        }
        transactions.set(latest, recorded.row);
        intentId = recorded.row.boostIntentId;
      }
      if (subscription.status === 'revoked' && subscription.latestTransactionId !== null) {
        await stampRevoked(
          tx,
          subscription.platform,
          subscription.latestTransactionId,
          'refund',
          now,
        );
      }
      const handler = purchaseHandler(PRODUCT_ROLES[subscription.productKey]);
      if (handler?.subscriptionChanged !== undefined) {
        const outcome = await handler.subscriptionChanged(
          tx,
          { ...upserted.subscription, intentId },
          now,
        );
        for (const user of outcome.users ?? []) touchedUsers.add(user);
      }
    }
    drifted += await expireUnlisted(
      tx,
      uid,
      mapped.subscriptions.map((s) => ({ platform: s.platform, productKey: s.productKey })),
    );

    for (const purchase of mapped.purchases) {
      const own = matches(purchase.platform, purchase.transactionId) ? facts : undefined;
      const recorded = await recordTransaction(tx, uid, {
        platform: purchase.platform,
        transactionId: purchase.transactionId,
        originalTransactionId: null,
        storeProductId: purchase.storeProductId,
        productKey: purchase.productKey,
        purchasedAt: purchase.purchasedAt,
        environment: purchase.environment,
        subscriptionId: null,
        price: own?.price ?? null,
        storefront: own?.storefront ?? null,
        offerCode: own?.offerCode ?? null,
        intentId: own === undefined ? null : intentFromFacts,
      });
      if (recorded.ownedByOther) {
        ownedByOther.push(purchase.transactionId);
        continue;
      }
      transactions.set(purchase.transactionId, recorded.row);
      const handler = purchaseHandler(PRODUCT_ROLES[purchase.productKey]);
      if (!recorded.revoked && handler?.fulfil !== undefined) {
        const outcome = await handler.fulfil(tx, recorded.row, now);
        boostIds.set(purchase.transactionId, outcome.boostId ?? null);
        for (const user of outcome.users ?? []) touchedUsers.add(user);
      }
    }

    if (facts?.revoked != null) {
      const stamped = await stampRevoked(
        tx,
        facts.platform,
        facts.transactionId,
        facts.revoked,
        now,
      );
      if (stamped?.newly === true) {
        const handler = purchaseHandler(PRODUCT_ROLES[stamped.row.productKey as ProductKey]);
        const outcome = await handler?.revoke?.(tx, stamped.row, facts.revoked, now);
        for (const user of outcome?.users ?? []) touchedUsers.add(user);
      }
    }

    let passPlus = false;
    for (const user of touchedUsers) {
      const row = await recomputeUser(tx, user, { now: () => now });
      if (user === uid) passPlus = row.passPlus;
    }
    return {
      drifted,
      transactions,
      ownedByOther,
      boostIds,
      unknownProducts: mapped.unknownProducts,
      passPlus,
    };
  });
}
