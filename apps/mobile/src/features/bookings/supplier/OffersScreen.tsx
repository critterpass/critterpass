/**
 * Where to book one activity: live Viator products for the trip's day when the in-app booking is
 * on, else a partner link per supplier (the data lives in `useOffers`).
 */
import { router } from 'expo-router';

import type { SupplierApi } from './data/api';
import { OffersView } from './OffersView';
import { useOffers, type OfferParams } from './use-offers';

export type { OfferParams } from './use-offers';

export function OffersScreen({
  params,
  api,
}: {
  readonly params: OfferParams;
  readonly api?: SupplierApi;
}) {
  return <OffersView {...useOffers(params, api)} onBack={() => router.back()} />;
}
