/** "What's in each" state over the synced perk list and the store's prices, for both UIs. */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, SQL and Intl options, never copy. */
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';

import { TRIP_SQL, TRIP_TABLES, type TripRow } from '../data/billing-rows';
import { openPrivacy, openTerms } from '../paywall/legal-links';
import { usePassPurchase } from '../paywall/use-pass-purchase';
import { compareRows } from '../perks/perk-copy';
import { boostHref } from '../routes';
import type { CompareViewProps } from './compare-view';

const ENDED = ['post_trip', 'archived', 'cancelled'];

export function useCompareScreen(): CompareViewProps {
  const params = useLocalSearchParams<{ period?: string; tripId?: string }>();
  const tripId = typeof params.tripId === 'string' && params.tripId !== '' ? params.tripId : null;
  const { rows, store, model, purchase, buy } = usePassPurchase(
    params.period === 'monthly' ? 'monthly' : 'yearly',
  );
  const trip = useLiveRows<TripRow>(TRIP_SQL, tripId === null ? null : [tripId], TRIP_TABLES);
  const contextTrip = trip.rows[0];
  const canBoost =
    contextTrip !== undefined &&
    contextTrip.boost_active !== 1 &&
    !ENDED.includes(contextTrip.status);
  const compare = useMemo(() => compareRows(rows.perks), [rows.perks]);
  return {
    rows: compare,
    model,
    store: store?.platform ?? null,
    canBoost,
    onBuy: buy,
    onCheckAgain: purchase.retryVerify,
    onBoost: () => {
      if (tripId !== null) router.push(boostHref(tripId));
    },
    onTerms: openTerms,
    onPrivacy: openPrivacy,
  };
}
