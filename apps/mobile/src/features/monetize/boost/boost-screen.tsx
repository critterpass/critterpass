/**
 * The boost sheet (4b-3) over the real flow: take the trip's lock on the server, tell the store
 * which lock the purchase belongs to, pay, and let the server verify it and switch the boost on.
 * A purchase the store did not take gives the lock back. The stamp page opens only once the
 * server has confirmed.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, wire values and Intl options, never copy. */
import {
  createBoostIntentResultSchema,
  generateUuidV7,
  type BoostSplitMode,
  type ProductKey,
} from '@cp/domain';
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useProducts } from '@/data/billing';
import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { useLiveRows } from '@/data/plan/live-rows';
import { useOnline } from '@/data/places/server-name-search';
import { useLocale } from '@/lib/i18n/use-locale';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { useTheme } from '@/ui/theme';

import {
  LOCK_SQL,
  LOCK_TABLES,
  SEATED_SQL,
  SEATED_TABLES,
  TRIP_SQL,
  TRIP_TABLES,
  type LockRow,
  type SeatedRow,
  type TripRow,
} from '../data/billing-rows';
import { appliedResult, CommandRefused, usePurchase, useStore } from '../data/use-billing';
import { useBillingRows } from '../data/use-billing-rows';
import { openPrivacy, openTerms } from '../paywall/legal-links';
import { stampedHref } from '../routes';
import { boostModel, type BoostOption, type WhoPays } from './boost-model';
import { BoostView } from './boost-view';

interface CreateIntent {
  readonly intent_id: string;
  readonly trip_id: string;
  readonly product_key: Extract<ProductKey, 'boost_trip' | 'boost_crew_year'>;
  readonly split_mode: BoostSplitMode;
  readonly member_uids: readonly string[];
}

export const createBoostIntentCommand = defineClientCommand<CreateIntent>({
  name: 'create_boost_intent',
  offline: false,
});
export const releaseBoostIntentCommand = defineClientCommand<{ readonly intent_id: string }>({
  name: 'release_boost_intent',
  offline: false,
});

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };

function day(locale: string, iso: string | null): string | null {
  if (iso === null) return null;
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : format.date(locale, date, DAY_MONTH);
}

export function BoostScreen() {
  const { t } = useLingui();
  const theme = useTheme();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId = typeof params.tripId === 'string' ? params.tripId : '';
  const locale = useLocale();
  const online = useOnline();
  const rows = useBillingRows();
  const store = useStore(rows.uid);
  const products = useProducts(store, locale, rows.catalogue);
  const purchase = usePurchase(store);
  const createIntent = useCommand(createBoostIntentCommand);
  const releaseIntent = useCommand(releaseBoostIntentCommand);
  const [option, setOption] = useState<BoostOption>('trip');
  const [whoPays, setWhoPays] = useState<WhoPays>('cover');
  const [intentError, setIntentError] = useState<'locked' | 'refused' | null>(null);
  const [starting, setStarting] = useState(false);
  const [now] = useState(() => new Date());
  const intent = useRef<{ id: string; split: boolean } | null>(null);

  const key = tripId === '' ? null : [tripId];
  const trip = useLiveRows<TripRow>(TRIP_SQL, key, TRIP_TABLES).rows[0];
  const seatedRows = useLiveRows<SeatedRow>(SEATED_SQL, key, SEATED_TABLES).rows;
  const lock = useLiveRows<LockRow>(LOCK_SQL, key, LOCK_TABLES).rows[0];
  const seated = seatedRows.map((row) => ({ uid: row.user_id, name: row.display_name ?? '' }));

  const model = boostModel({
    products,
    purchase: purchase.state,
    online,
    option,
    whoPays,
    trip:
      trip === undefined
        ? null
        : {
            status: trip.status,
            boostActive: trip.boost_active === 1,
            endDate: trip.end_date,
            solo: trip.is_solo === 1,
          },
    seated,
    buyerUid: rows.uid,
    lock:
      lock === undefined
        ? null
        : { buyerUid: lock.buyer_id, name: lock.display_name ?? '', expiresAt: lock.expires_at },
    intentError,
    now,
    locale,
  });

  const status = purchase.state.status;
  const stage = purchase.state.status === 'failed' ? purchase.state.stage : null;
  useEffect(() => {
    const held = intent.current;
    if (held === null) return;
    if (status === 'done') {
      router.replace(stampedHref(tripId, held.split));
      return;
    }
    // The store took nothing: give the trip's lock back so a crewmate can pay instead.
    if (status === 'cancelled' || (status === 'failed' && stage === 'store')) {
      intent.current = null;
      void releaseIntent.send({ intent_id: held.id }).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the purchase alone
  }, [status, stage]);

  const buy = async () => {
    const { offer } = model;
    if (offer === null || !model.canBuy || store === null || starting) return;
    setStarting(true);
    setIntentError(null);
    const intentId = generateUuidV7();
    try {
      const result = createBoostIntentResultSchema.parse(
        appliedResult(
          await createIntent.send({
            intent_id: intentId,
            trip_id: tripId,
            product_key: model.productKey === 'boost_crew_year' ? 'boost_crew_year' : 'boost_trip',
            split_mode: model.whoPays,
            member_uids: model.memberUids,
          }),
        ),
      );
      await store.setAttributes({
        [result.subscriber_attribute.key]: result.subscriber_attribute.value,
      });
      intent.current = { id: intentId, split: model.whoPays === 'split' };
      purchase.buy({
        productKey: model.productKey,
        storeProductId: offer.storeProductId,
        intentId,
      });
    } catch (error) {
      const code = error instanceof CommandRefused ? error.code : null;
      setIntentError(code === 'BOOST_INTENT_LOCKED' ? 'locked' : 'refused');
      // The lock may have been taken before the store refused its attribute.
      if (code === null) void releaseIntent.send({ intent_id: intentId }).catch(() => undefined);
    } finally {
      setStarting(false);
    }
  };

  const start = day(locale, trip?.start_date ?? null);
  const end = day(locale, trip?.end_date ?? null);
  return (
    <Sheet
      detents={['fit']}
      accessibilityLabel={t({ id: 'monetize.boost.sheet', message: 'Boost this trip' })}
      testID="boost-sheet"
    >
      <SheetScrollView
        contentContainerStyle={{ padding: theme.size.gutter, paddingBottom: theme.space['32'] }}
      >
        <BoostView
          model={model}
          destination={trip?.destination ?? ''}
          crew={trip?.crew ?? ''}
          dates={start !== null && end !== null ? `${start} – ${end}` : ''}
          windowEnd={day(locale, model.windowEnd)}
          seated={seated}
          store={store?.platform ?? null}
          onOption={setOption}
          onWhoPays={setWhoPays}
          onBuy={() => void buy()}
          onCheckAgain={purchase.retryVerify}
          onTerms={openTerms}
          onPrivacy={openPrivacy}
        />
      </SheetScrollView>
    </Sheet>
  );
}
