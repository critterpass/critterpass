/**
 * Restore purchases: the store hands back what this Apple/Google account bought and each
 * transaction is synced to our API (idempotent on the transaction id), which decides what the
 * Critterpass account gets. Purchases bound to another Critterpass account are not moved; the
 * user is asked to sign in to that account.
 */
import type { FulfilPurchaseResult } from '@cp/domain';

import type { StorePort } from './revenuecat';

export type RestoreResult =
  | { readonly kind: 'restored'; readonly passPlus: boolean; readonly count: number }
  | { readonly kind: 'nothing' }
  | { readonly kind: 'other_account' }
  | { readonly kind: 'failed'; readonly code: string };

export async function restorePurchases(
  store: StorePort,
  fulfil: (payload: {
    source: 'client_sync';
    platform: StorePort['platform'];
    transaction_id: string;
    store_product_id: string;
  }) => Promise<FulfilPurchaseResult>,
): Promise<RestoreResult> {
  const outcome = await store.restore();
  if (outcome.kind !== 'restored') return outcome;
  if (outcome.transactions.length === 0) return { kind: 'nothing' };
  let passPlus = false;
  let count = 0;
  for (const transaction of outcome.transactions) {
    try {
      const result = await fulfil({
        source: 'client_sync',
        platform: store.platform,
        transaction_id: transaction.transactionId,
        store_product_id: transaction.productId,
      });
      passPlus ||= result.pass_plus;
      count += 1;
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      // A transaction the server cannot verify for this account is not this account's to restore.
      if (code === 'STATE_INVALID' || code === 'FORBIDDEN') continue;
      return { kind: 'failed', code: typeof code === 'string' ? code : 'NETWORK' };
    }
  }
  return count === 0 ? { kind: 'nothing' } : { kind: 'restored', passPlus, count };
}
