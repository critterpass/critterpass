/**
 * The seat-limit presenter the boost area registers: "Seven's a crowd" when a boost would open the
 * seat, and the crew area's own waitlist sheet when it would not (the trip is boosted already and
 * full at its higher cap). BOOST opens the boost sheet for the trip; "Keep it at six" waitlists
 * the invitee through the same invite.
 */
import { router } from 'expo-router';
import { useMemo } from 'react';

import { useProducts } from '@/data/billing';
import { useLiveRows } from '@/data/plan/live-rows';
import { WaitlistSheet, type SeatLimitPresenterProps } from '@/features/crew';
import { useLocale } from '@/lib/i18n/use-locale';
import { memberFirstName } from '@/ui/people/member-name';

import { sharePreview } from '../boost/boost-model';
import { SEATED_SQL, SEATED_TABLES, type SeatedRow } from '../data/billing-rows';
import { useStore } from '../data/use-billing';
import { useBillingRows } from '../data/use-billing-rows';
import { boostHref } from '../routes';
import { SeatCapView } from './seat-cap-view';

/** Stands in for the invitee in the split: they have no account yet. */
const INVITEE = 'invitee';

export function SeatCapSheet(props: SeatLimitPresenterProps) {
  if (props.detail.offer !== 'boost') return <WaitlistSheet {...props} />;
  return <BoostSeatSheet {...props} />;
}

function BoostSeatSheet({ detail, tripName, onWaitlist, onDismiss }: SeatLimitPresenterProps) {
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
  return (
    <SeatCapView
      destination={tripName}
      cap={detail.cap}
      seats={seated.map((row) => ({
        uid: row.user_id,
        name: memberFirstName(row.display_name),
      }))}
      invitee={detail.invitee}
      price={offer?.priceString ?? null}
      each={each?.text ?? null}
      ways={sharers.length}
      onBoost={() => {
        onDismiss();
        router.push(boostHref(detail.trip_id));
      }}
      onKeep={onWaitlist}
      onDismiss={onDismiss}
    />
  );
}
