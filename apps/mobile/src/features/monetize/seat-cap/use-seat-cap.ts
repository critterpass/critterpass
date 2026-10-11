/** The seat-limit numbers "Seven's a crowd" shows, for both UIs. */
import { router } from 'expo-router';
import { useMemo } from 'react';

import { useProducts } from '@/data/billing';
import { useLiveRows } from '@/data/plan/live-rows';
import type { SeatLimitPresenterProps } from '@/features/crew';
import { useLocale } from '@/lib/i18n/use-locale';
import { memberFirstName } from '@/ui/people/member-name';

import { sharePreview } from '../boost/boost-model';
import { SEATED_SQL, SEATED_TABLES, type SeatedRow } from '../data/billing-rows';
import { useStore } from '../data/use-billing';
import { useBillingRows } from '../data/use-billing-rows';
import { boostHref } from '../routes';
import type { SeatCapViewProps } from './seat-cap-view';

/** Stands in for the invitee in the split: they have no account yet. */
const INVITEE = 'invitee';

export function useBoostSeatCap({
  detail,
  tripName,
  onWaitlist,
  onDismiss,
}: SeatLimitPresenterProps): SeatCapViewProps {
  const locale = useLocale();
  const rows = useBillingRows();
  const store = useStore(rows.uid);
  const products = useProducts(store, locale, rows.catalogue);
  const key = useMemo(() => [detail.trip_id], [detail.trip_id]);
  const seated = useLiveRows<SeatedRow>(SEATED_SQL, key, SEATED_TABLES).rows;
  const offer = products.status === 'ready' ? (products.offers.boost_trip ?? null) : null;
  const sharers = [...seated.map((row) => row.user_id), INVITEE];
  const each =
    offer === null || rows.uid === null || !sharers.includes(rows.uid)
      ? null
      : sharePreview(offer, rows.uid, sharers, locale);
  return {
    destination: tripName,
    cap: detail.cap,
    seats: seated.map((row) => ({ uid: row.user_id, name: memberFirstName(row.display_name) })),
    invitee: detail.invitee,
    price: offer?.priceString ?? null,
    each: each?.text ?? null,
    ways: sharers.length,
    onBoost: () => {
      onDismiss();
      router.push(boostHref(detail.trip_id));
    },
    onKeep: onWaitlist,
    onDismiss,
  };
}
