/**
 * Purchases the store finishes outside a purchase sheet (Ask to Buy approved later, SCA, an
 * interrupted purchase completing at the next launch) are synced to our API as soon as the store
 * reports them, so the entitlement never waits on RevenueCat's webhook. Each transaction is sent
 * once per process; the server is idempotent on the transaction id anyway.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, store codes and product ids, never copy. */
import type { FulfilPurchaseResult } from '@cp/domain';

import type { StorePort, StoreTransaction } from './revenuecat';

export function startPurchaseListener(
  store: StorePort,
  fulfil: (payload: {
    source: 'client_sync';
    platform: StorePort['platform'];
    transaction_id: string;
    store_product_id: string;
  }) => Promise<FulfilPurchaseResult>,
  onSynced?: (transaction: StoreTransaction, result: FulfilPurchaseResult) => void,
): () => void {
  const sent = new Set<string>();
  return store.onTransactions((transactions) => {
    for (const transaction of transactions) {
      if (sent.has(transaction.transactionId)) continue;
      sent.add(transaction.transactionId);
      fulfil({
        source: 'client_sync',
        platform: store.platform,
        transaction_id: transaction.transactionId,
        store_product_id: transaction.productId,
      }).then(
        (result) => onSynced?.(transaction, result),
        // Unsent: the next store update (or the webhook) carries it.
        () => sent.delete(transaction.transactionId),
      );
    }
  });
}
