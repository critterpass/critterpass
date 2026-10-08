/**
 * The paywall (4e-1) over the real store: prices come from the store, the button runs the shared
 * purchase flow, and Pass+ shows as on only once the server's entitlement row says so. With no
 * store or no products the page says purchases are not available yet.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, SQL and Intl options, never copy. */
import { format } from '@cp/i18n';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { goBackOr } from '@/lib/navigation/back';
import { useLiveRows } from '@/data/plan/live-rows';
import { useLocale } from '@/lib/i18n/use-locale';
import { RiseModal } from '@/ui/sheet/RiseModal';

import { TRIP_SQL, TRIP_TABLES, type TripRow } from '../data/billing-rows';
import { useRestore } from '../data/use-billing';
import { perkLines } from '../perks/perk-copy';
import { boostHref, MONETIZE_ROUTES } from '../routes';
import { openPrivacy, openTerms } from './legal-links';
import type { BillingPeriod } from './paywall-model';
import { PaywallView } from './paywall-view';
import { usePassPurchase } from './use-pass-purchase';
import { entryPointOf, usePaywallRecord } from './use-paywall-record';

const FTF_SQL = `SELECT c.name AS crew, g.ends_at FROM ftf_grants g
  JOIN crews c ON c.id = g.crew_id
  WHERE g.abuse_decision <> 'revoked' AND g.ends_at > ? ORDER BY g.ends_at LIMIT 1`;
const FTF_TABLES = ['ftf_grants', 'crews'];
const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };

const ENDED = ['post_trip', 'archived', 'cancelled'];

export function PaywallScreen() {
  const params = useLocalSearchParams<{ entry?: string; tripId?: string }>();
  const tripId = typeof params.tripId === 'string' && params.tripId !== '' ? params.tripId : null;
  const locale = useLocale();
  const [period, setPeriod] = useState<BillingPeriod>('yearly');
  const { rows, store, model, purchase, buy } = usePassPurchase(period);
  const restore = useRestore(store);
  const [openedAt] = useState(() => new Date().toISOString());
  const quietNo = usePaywallRecord(entryPointOf(params.entry), tripId);

  const ftf = useLiveRows<{ crew: string; ends_at: string }>(FTF_SQL, [openedAt], FTF_TABLES);
  const trip = useLiveRows<TripRow>(TRIP_SQL, tripId === null ? null : [tripId], TRIP_TABLES);
  const { state } = purchase;

  const passPerks = useMemo(() => perkLines(rows.perks, 'pass_plus'), [rows.perks]);
  const boostPerks = useMemo(() => perkLines(rows.perks, 'boost'), [rows.perks]);
  const firstTrip = ftf.rows[0];
  const contextTrip = trip.rows[0];
  const boostable =
    contextTrip !== undefined &&
    contextTrip.boost_active !== 1 &&
    !ENDED.includes(contextTrip.status);

  return (
    <RiseModal
      closeSide="start"
      onDismiss={() => {
        if (!rows.passPlus && state.status !== 'done') quietNo();
        goBackOr();
      }}
      testID="paywall-rise"
    >
      <PaywallView
        model={model}
        holder={rows.name}
        store={store?.platform ?? null}
        passPerks={passPerks}
        boostPerks={boostPerks}
        firstTripFree={
          firstTrip === undefined
            ? null
            : {
                crew: firstTrip.crew,
                until: format.date(locale, new Date(firstTrip.ends_at), DAY_MONTH),
              }
        }
        boostTrip={boostable ? { name: contextTrip.destination ?? '' } : null}
        restore={restore.state}
        onPeriod={setPeriod}
        onBuy={buy}
        onCheckAgain={purchase.retryVerify}
        onRestore={restore.restore}
        onCompare={() =>
          router.push({
            pathname: MONETIZE_ROUTES.compare,
            params: { period: model.period, ...(tripId === null ? {} : { tripId }) },
          })
        }
        onBoost={() => {
          if (tripId !== null) router.push(boostHref(tripId));
        }}
        onPlan={() => router.replace(MONETIZE_ROUTES.plan)}
        onTerms={openTerms}
        onPrivacy={openPrivacy}
      />
    </RiseModal>
  );
}
