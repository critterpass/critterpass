/**
 * What the paywall shows for each product: the store's own localised price (never one of ours),
 * the period, the per-month price of a yearly plan and its saving against twelve monthly
 * payments. Store product ids default to the product keys (the StoreKit configuration file and
 * the RevenueCat products use them verbatim); a synced `products.store_ids` row overrides them.
 */
import { PRODUCT_KEYS, type ProductKey, type StoreIds, type StorePlatform } from '@cp/domain';
import { useEffect, useState } from 'react';

import type { StorePort, StoreProduct } from './revenuecat';

export interface ProductOffer {
  readonly key: ProductKey;
  readonly storeProductId: string;
  readonly priceString: string;
  readonly price: number;
  readonly currencyCode: string;
  readonly period: {
    readonly unit: 'day' | 'week' | 'month' | 'year';
    readonly count: number;
  } | null;
  /** A yearly plan's price per month in the store currency, formatted for the locale. */
  readonly perMonthString: string | null;
  /** Whole-percent saving of a yearly plan against twelve monthly payments, when both are known. */
  readonly savingsPercent: number | null;
}

export type ProductOffers = Partial<Record<ProductKey, ProductOffer>>;

export function storeProductIds(
  platform: StorePlatform,
  catalogue: ReadonlyArray<{ readonly key: ProductKey; readonly storeIds: StoreIds }> = [],
): Record<ProductKey, string> {
  const ids = Object.fromEntries(PRODUCT_KEYS.map((key) => [key, key])) as Record<
    ProductKey,
    string
  >;
  for (const product of catalogue) {
    const id = product.storeIds[platform];
    // Play subscription ids may carry a base plan (`pass:monthly`); RevenueCat takes them whole.
    if (id) ids[product.key] = id;
  }
  return ids;
}

const PERIOD = /^P(\d+)([DWMY])$/u;
const UNITS = { D: 'day', W: 'week', M: 'month', Y: 'year' } as const;

export function parsePeriod(iso: string | null): ProductOffer['period'] {
  const match = iso ? PERIOD.exec(iso) : null;
  if (!match?.[1] || !match[2]) return null;
  return { unit: UNITS[match[2] as keyof typeof UNITS], count: Number(match[1]) };
}

function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

export function describeProducts(
  products: readonly StoreProduct[],
  ids: Readonly<Record<ProductKey, string>>,
  locale: string,
): ProductOffers {
  const byId = new Map(products.map((product) => [product.id, product]));
  const offers: ProductOffers = {};
  for (const key of PRODUCT_KEYS) {
    const product = byId.get(ids[key]);
    if (!product) continue;
    offers[key] = {
      key,
      storeProductId: product.id,
      priceString: product.priceString,
      price: product.price,
      currencyCode: product.currencyCode,
      period: parsePeriod(product.subscriptionPeriod),
      perMonthString: null,
      savingsPercent: null,
    };
  }
  const yearly = offers.pass_yearly;
  const monthly = offers.pass_monthly;
  if (yearly) {
    const perMonth = formatMoney(yearly.price / 12, yearly.currencyCode, locale);
    const saving =
      monthly && monthly.currencyCode === yearly.currencyCode && monthly.price > 0
        ? Math.round((1 - yearly.price / (monthly.price * 12)) * 100)
        : null;
    offers.pass_yearly = {
      ...yearly,
      perMonthString: perMonth,
      savingsPercent: saving !== null && saving > 0 ? saving : null,
    };
  }
  return offers;
}

export type ProductsState =
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'ready'; readonly offers: ProductOffers };

/** The store's offers for every product, once per mount; `unavailable` without a store. */
export function useProducts(
  store: StorePort | null,
  locale: string,
  catalogue?: ReadonlyArray<{ readonly key: ProductKey; readonly storeIds: StoreIds }>,
): ProductsState {
  const [loaded, setLoaded] = useState<{
    readonly store: StorePort;
    readonly state: ProductsState;
  } | null>(null);
  useEffect(() => {
    if (!store) return undefined;
    let live = true;
    const setState = (state: ProductsState) => setLoaded({ store, state });
    const ids = storeProductIds(store.platform, catalogue);
    store
      .products(Object.values(ids))
      .then((products) => {
        if (!live) return;
        const offers = describeProducts(products, ids, locale);
        setState(
          Object.keys(offers).length > 0 ? { status: 'ready', offers } : { status: 'unavailable' },
        );
      })
      .catch(() => {
        if (live) setState({ status: 'unavailable' });
      });
    return () => {
      live = false;
    };
  }, [store, locale, catalogue]);
  if (!store) return { status: 'unavailable' };
  return loaded?.store === store ? loaded.state : { status: 'loading' };
}
