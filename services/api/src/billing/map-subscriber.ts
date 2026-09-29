/**
 * What a RevenueCat customer read means for us (pure): each store subscription's state on the
 * subscription machine (docs/data-model-sync-and-privacy.md §3.6) and each one-off purchase. The
 * server's own grace is 7 days from the store's first billing failure on both stores (`ops_config
 * billing.grace_days`), applied by the domain's subscription machine.
 */
import { assertCurrencyCode, currencyExponent, isKnownCurrency } from '@cp/cost-engine';
import {
  productKeyForStoreId,
  subscriptionState,
  type ProductKey,
  type StoreIds,
  type StorePlatform,
  type SubscriptionState,
  type SubscriptionStateResult,
} from '@cp/domain';

import type { RcNonSubscription, RcSubscriber, RcSubscription } from './rc-client';

export interface ProductCatalogueEntry {
  readonly key: ProductKey;
  readonly storeIds: StoreIds;
}

export interface MappedSubscription {
  readonly platform: StorePlatform;
  readonly storeProductId: string;
  readonly productKey: ProductKey;
  readonly status: SubscriptionState;
  readonly autoRenew: boolean;
  readonly periodStart: Date;
  readonly periodEnd: Date | null;
  readonly graceEndsAt: Date | null;
  readonly pausedFrom: Date | null;
  readonly resumeAt: Date | null;
  readonly environment: 'production' | 'sandbox';
  /** The store's latest transaction of this subscription, when RevenueCat reports it. */
  readonly latestTransactionId: string | null;
  readonly refundedAt: Date | null;
}

export interface MappedPurchase {
  readonly platform: StorePlatform;
  readonly storeProductId: string;
  readonly productKey: ProductKey;
  readonly transactionId: string;
  readonly purchasedAt: Date;
  readonly environment: 'production' | 'sandbox';
}

export interface MappedSubscriber {
  readonly subscriptions: readonly MappedSubscription[];
  readonly purchases: readonly MappedPurchase[];
  /** Store product ids no catalogue product matches (reported, never guessed at). */
  readonly unknownProducts: readonly string[];
  readonly attributes: Readonly<Record<string, string>>;
}

export interface MapOptions {
  readonly now: Date;
  readonly graceDays: number;
  readonly catalogue: readonly ProductCatalogueEntry[];
}

/** RevenueCat's store name → ours; other stores (promotional grants, web) are not ours to map. */
export function platformOf(store: string | null | undefined): StorePlatform | undefined {
  const name = store?.toLowerCase();
  if (name === 'app_store' || name === 'mac_app_store') return 'app_store';
  return name === 'play_store' ? 'play' : undefined;
}

function dateOrNull(value: string | null | undefined): Date | null {
  return value === null || value === undefined ? null : new Date(value);
}

/** One subscription's place on the machine at `now`. */
export function stateOf(
  entry: RcSubscription,
  platform: StorePlatform,
  now: Date,
  graceDays: number,
): SubscriptionStateResult {
  return subscriptionState(
    {
      expiresAt: dateOrNull(entry.expires_date),
      billingIssueAt: dateOrNull(entry.billing_issues_detected_at),
      unsubscribedAt: dateOrNull(entry.unsubscribe_detected_at),
      refundedAt: dateOrNull(entry.refunded_at),
      autoResumeAt: dateOrNull(entry.auto_resume_date),
    },
    platform,
    now,
    graceDays,
  );
}

function mapSubscription(
  storeProductId: string,
  entry: RcSubscription,
  options: MapOptions,
): MappedSubscription | string | undefined {
  const platform = platformOf(entry.store);
  if (platform === undefined) return undefined;
  const productKey = productKeyForStoreId(storeProductId, platform, options.catalogue);
  if (productKey === undefined) return storeProductId;
  return {
    platform,
    storeProductId,
    productKey,
    ...stateOf(entry, platform, options.now, options.graceDays),
    periodStart: new Date(entry.purchase_date),
    periodEnd: dateOrNull(entry.expires_date),
    environment: entry.is_sandbox ? 'sandbox' : 'production',
    latestTransactionId: entry.store_transaction_id ?? null,
    refundedAt: dateOrNull(entry.refunded_at),
  };
}

function mapPurchase(
  storeProductId: string,
  entry: RcNonSubscription,
  options: MapOptions,
): MappedPurchase | string | undefined {
  const platform = platformOf(entry.store);
  if (platform === undefined) return undefined;
  const productKey = productKeyForStoreId(storeProductId, platform, options.catalogue);
  if (productKey === undefined) return storeProductId;
  return {
    platform,
    storeProductId,
    productKey,
    transactionId: entry.store_transaction_id ?? entry.id,
    purchasedAt: new Date(entry.purchase_date),
    environment: entry.is_sandbox ? 'sandbox' : 'production',
  };
}

export function mapSubscriber(subscriber: RcSubscriber, options: MapOptions): MappedSubscriber {
  const subscriptions: MappedSubscription[] = [];
  const purchases: MappedPurchase[] = [];
  const unknownProducts = new Set<string>();
  for (const [storeProductId, entry] of Object.entries(subscriber.subscriptions)) {
    const mapped = mapSubscription(storeProductId, entry, options);
    if (typeof mapped === 'string') unknownProducts.add(mapped);
    else if (mapped !== undefined) subscriptions.push(mapped);
  }
  for (const [storeProductId, entries] of Object.entries(subscriber.non_subscriptions)) {
    for (const entry of entries) {
      const mapped = mapPurchase(storeProductId, entry, options);
      if (typeof mapped === 'string') unknownProducts.add(mapped);
      else if (mapped !== undefined) purchases.push(mapped);
    }
  }
  const attributes: Record<string, string> = {};
  for (const [key, attribute] of Object.entries(subscriber.subscriber_attributes)) {
    if (typeof attribute.value === 'string') attributes[key] = attribute.value;
  }
  return { subscriptions, purchases, unknownProducts: [...unknownProducts], attributes };
}

/** A store price (a decimal in the purchase currency) in minor units, when the currency is known. */
export function priceMinor(
  amount: number | null | undefined,
  currency: string | null | undefined,
): { amountMinor: bigint; currency: string } | null {
  if (amount === null || amount === undefined || currency === null || currency === undefined) {
    return null;
  }
  const code = currency.toUpperCase();
  if (!isKnownCurrency(code) || amount < 0) return null;
  const exponent = currencyExponent(assertCurrencyCode(code));
  return { amountMinor: BigInt(Math.round(amount * 10 ** exponent)), currency: code };
}
