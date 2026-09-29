/**
 * What each product is for the billing engine (docs/product-decisions.md §3 "Products and codes"):
 * Pass+ subscriptions, the Trip Boost consumable, the auto-renewing crew yearly boost and the
 * IAP-funded gift. Store product ids live in `products.store_ids` and prices come from the store;
 * the reference prices below are configuration (`ops_config billing.reference_prices`) used only
 * where no store price is at hand (a server push quoting "{share} each"), never to charge anyone.
 */
import { z } from 'zod';

import { PRODUCT_KEYS, type ProductKey } from '../entitlements/product-keys';
import type { StorePlatform } from './states';

export type ProductRole = 'pass' | 'boost_trip' | 'crew_year' | 'gift';

export const PRODUCT_ROLES: Readonly<Record<ProductKey, ProductRole>> = {
  pass_monthly: 'pass',
  pass_yearly: 'pass',
  boost_trip: 'boost_trip',
  boost_crew_year: 'crew_year',
  gift_pass_3m: 'gift',
};

/** Products that renew (a `subscriptions` row per original transaction). */
export function isSubscriptionProduct(key: ProductKey): boolean {
  return key === 'pass_monthly' || key === 'pass_yearly' || key === 'boost_crew_year';
}

/** Store product ids per platform (`products.store_ids`), e.g. `{app_store: 'cp.pass.monthly'}`. */
export const storeIdsSchema = z
  .object({
    app_store: z.string().min(1).max(200).optional(),
    play: z.string().min(1).max(200).optional(),
  })
  .loose();
export type StoreIds = z.infer<typeof storeIdsSchema>;

/**
 * The product a store product id stands for. A Play subscription id may carry its base plan
 * (`pass:monthly`), so the part before `:` also matches. A product key used verbatim as the store
 * id (the StoreKit configuration file does this) matches itself.
 */
export function productKeyForStoreId(
  storeProductId: string,
  platform: StorePlatform,
  catalogue: ReadonlyArray<{ readonly key: ProductKey; readonly storeIds: StoreIds }>,
): ProductKey | undefined {
  const bare = storeProductId.split(':')[0] ?? storeProductId;
  for (const product of catalogue) {
    const id = product.storeIds[platform];
    if (id !== undefined && (id === storeProductId || id === bare)) return product.key;
  }
  return (PRODUCT_KEYS as readonly string[]).includes(bare) ? (bare as ProductKey) : undefined;
}

export const referencePriceSchema = z.object({
  amount_minor: z.int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/u),
});
export type ReferencePrice = z.infer<typeof referencePriceSchema>;

export const referencePricesSchema = z.record(z.enum(PRODUCT_KEYS), referencePriceSchema);
export type ReferencePrices = Partial<Record<ProductKey, ReferencePrice>>;

/** The store price tiers the catalogue was set up with (USD); the store's own price always wins. */
export const DEFAULT_REFERENCE_PRICES: Readonly<Record<ProductKey, ReferencePrice>> = {
  pass_monthly: { amount_minor: 399, currency: 'USD' },
  pass_yearly: { amount_minor: 2999, currency: 'USD' },
  boost_trip: { amount_minor: 1199, currency: 'USD' },
  boost_crew_year: { amount_minor: 5999, currency: 'USD' },
  gift_pass_3m: { amount_minor: 999, currency: 'USD' },
};

export const REFERENCE_PRICES_CONFIG_KEY = 'billing.reference_prices';

/** Days a gift code adds (fits the App Store's 90-day extension cap). */
export const GIFT_PASS_DAYS = 90;
