/**
 * `fulfil_purchase {source: client_sync}` (docs/api-contracts.md §4.15): the app reports a purchase
 * the store just confirmed so the paywall never waits on the webhook. Nothing is granted on the
 * app's word: the customer is re-read from RevenueCat and must list the transaction; then the same
 * sync the webhook path runs applies it (idempotent on the store transaction id). A transaction
 * bound to another Critterpass account answers `OWNED_BY_OTHER_ACCOUNT` and changes nothing.
 */
import type { KillSwitchReader } from '@cp/db';
import { DomainError, fulfilPurchasePayloadSchema, type FulfilPurchaseResult } from '@cp/domain';

import { asServer } from '../../billing/as-server';
import { graceDays } from '../../billing/grace';
import type { RcSubscriber, RevenueCatClient } from '../../billing/rc-client';
import { loadCatalogue } from '../../billing/store-records';
import { syncSubscriber } from '../../billing/sync-subscriber';
import { defineCommand } from '../_framework/define-command';

export interface BillingCommandDeps {
  readonly revenuecat: RevenueCatClient | undefined;
  readonly switches: Pick<KillSwitchReader, 'assertOn'>;
}

/** Whether RevenueCat lists `transactionId` for this customer, as a purchase or a renewal. */
export function listsTransaction(subscriber: RcSubscriber, transactionId: string): boolean {
  for (const entry of Object.values(subscriber.subscriptions)) {
    if (entry.store_transaction_id === transactionId) return true;
  }
  for (const entries of Object.values(subscriber.non_subscriptions)) {
    if (entries.some((entry) => (entry.store_transaction_id ?? entry.id) === transactionId)) {
      return true;
    }
  }
  return false;
}

export function fulfilPurchaseCommand(deps: BillingCommandDeps) {
  return defineCommand({
    name: 'fulfil_purchase',
    v: 1,
    schema: fulfilPurchasePayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async () => {
      await deps.switches.assertOn('billing.enabled');
    },
    handle: async (tx, payload, ctx): Promise<FulfilPurchaseResult> => {
      if (deps.revenuecat === undefined) {
        throw new DomainError('STATE_INVALID', { reason: 'store_unverifiable' });
      }
      const subscriber = await deps.revenuecat.getSubscriber(ctx.uid);
      if (!listsTransaction(subscriber, payload.transaction_id)) {
        throw new DomainError('STATE_INVALID', { reason: 'transaction_unverified' });
      }
      const { days, catalogue } = await asServer(tx, async () => ({
        days: await graceDays(tx),
        catalogue: await loadCatalogue(tx),
      }));
      const outcome = await syncSubscriber(tx, ctx.uid, subscriber, {
        now: ctx.clock.serverNow,
        graceDays: days,
        catalogue,
        facts: {
          platform: payload.platform,
          transactionId: payload.transaction_id,
          originalTransactionId: null,
          storeProductId: payload.store_product_id,
          price: null,
          storefront: null,
          offerCode: null,
          intentId: payload.intent_id ?? null,
          revoked: null,
        },
      });
      if (outcome.ownedByOther.includes(payload.transaction_id)) {
        throw new DomainError('OWNED_BY_OTHER_ACCOUNT');
      }
      const txn = outcome.transactions.get(payload.transaction_id);
      if (txn === undefined) {
        throw new DomainError('STATE_INVALID', { reason: 'transaction_unverified' });
      }
      const boostId = outcome.boostIds.get(payload.transaction_id) ?? null;
      return {
        status: boostId === null && txn.productKey === 'boost_trip' ? 'pending' : 'fulfilled',
        product_key: txn.productKey,
        pass_plus: outcome.passPlus,
        boost_id: boostId,
      };
    },
  });
}
