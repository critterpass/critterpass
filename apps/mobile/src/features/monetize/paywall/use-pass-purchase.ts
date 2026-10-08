/**
 * Buying Pass+ from any surface (the paywall, "What's in each"): the store's offers, the purchase
 * flow and the model the surface draws, with the welcome opened once the server has confirmed.
 */
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { useProducts, type StorePort } from '@/data/billing';
import { useOnline } from '@/data/places/server-name-search';
import { useLocale } from '@/lib/i18n/use-locale';

import { usePurchase, useStore, type PurchaseControls } from '../data/use-billing';
import { useBillingRows, type BillingRows } from '../data/use-billing-rows';
import { MONETIZE_ROUTES } from '../routes';
import { paywallModel, type BillingPeriod, type PaywallModel } from './paywall-model';

export interface PassPurchase {
  readonly rows: BillingRows;
  readonly store: StorePort | null;
  readonly model: PaywallModel;
  readonly purchase: PurchaseControls;
  readonly buy: () => void;
}

export function usePassPurchase(period: BillingPeriod): PassPurchase {
  const locale = useLocale();
  const online = useOnline();
  const rows = useBillingRows();
  const store = useStore(rows.uid);
  // The store is asked for its offers again each time signal returns: a paywall opened offline
  // has none, and would otherwise stay empty until it was reopened.
  const catalogue = useMemo(
    () => [...rows.catalogue],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `online` renews the list on purpose
    [rows.catalogue, online],
  );
  const products = useProducts(store, locale, catalogue);
  const purchase = usePurchase(store);
  const model = paywallModel({
    products,
    purchase: purchase.state,
    period,
    passPlus: rows.passPlus,
    online,
  });

  // The welcome follows a purchase the server confirmed, never the store's word alone.
  const { state } = purchase;
  const confirmed = state.status === 'done' && state.passPlus;
  useEffect(() => {
    if (confirmed) router.replace(MONETIZE_ROUTES.welcome);
  }, [confirmed]);

  const buy = () => {
    const { offer } = model;
    if (offer === null || !model.canBuy) return;
    purchase.buy({ productKey: offer.key, storeProductId: offer.storeProductId });
  };

  return { rows, store, model, purchase, buy };
}
