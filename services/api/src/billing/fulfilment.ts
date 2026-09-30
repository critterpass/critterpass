/**
 * What a purchase does once the store and RevenueCat agree it happened, by product role: a Trip
 * Boost activates on its trip, a crew yearly subscription keeps its crew's grant in step, a gift
 * waits for its sender to write the gift. Each role registers its own handler from its module;
 * every handler is idempotent (the same transaction reported twice changes nothing), because a
 * purchase can arrive by webhook, by the app and by the nightly reconcile.
 */
import type { ProductRole, RevocationReason, SubscriptionState } from '@cp/domain';
import type pg from 'pg';

export interface StoredTransaction {
  readonly id: string;
  readonly userId: string;
  readonly platform: 'app_store' | 'play';
  readonly transactionId: string;
  readonly productKey: string;
  readonly purchasedAt: Date;
  readonly priceMinor: bigint | null;
  readonly currency: string | null;
  readonly boostIntentId: string | null;
}

export interface FulfilOutcome {
  /** The boost this purchase activated (or already had), when it is a boost. */
  readonly boostId?: string | null;
  /** Users whose entitlements the handler changed besides the buyer (recomputed by the caller). */
  readonly users?: readonly string[];
}

export interface StoredSubscription {
  readonly id: string;
  readonly userId: string;
  readonly productKey: string;
  readonly status: SubscriptionState;
  readonly previousStatus: SubscriptionState | null;
  readonly periodStart: Date | null;
  readonly periodEnd: Date | null;
  readonly graceEndsAt: Date | null;
  readonly originalTransactionId: string | null;
  /** The intent the latest purchase of this subscription was bought under, when known. */
  readonly intentId: string | null;
}

export interface PurchaseHandler {
  /** A one-off purchase (consumable or non-renewing) the store confirmed. */
  readonly fulfil?: (
    tx: pg.PoolClient,
    txn: StoredTransaction,
    now: Date,
  ) => Promise<FulfilOutcome>;
  /** A store refund or revocation of a one-off purchase. */
  readonly revoke?: (
    tx: pg.PoolClient,
    txn: StoredTransaction,
    reason: RevocationReason,
    now: Date,
  ) => Promise<FulfilOutcome>;
  /** A subscription of this role changed state (created, renewed, lapsed, refunded). */
  readonly subscriptionChanged?: (
    tx: pg.PoolClient,
    subscription: StoredSubscription,
    now: Date,
  ) => Promise<FulfilOutcome>;
}

const handlers = new Map<ProductRole, PurchaseHandler>();

export function registerPurchaseHandler(role: ProductRole, handler: PurchaseHandler): void {
  handlers.set(role, handler);
}

export function purchaseHandler(role: ProductRole): PurchaseHandler | undefined {
  return handlers.get(role);
}
