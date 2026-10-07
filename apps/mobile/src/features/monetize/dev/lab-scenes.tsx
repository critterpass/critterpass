/**
 * The monetization lab scenes for review and screenshots: each renders a pure view with fixed
 * props, keyed by design id and state, with every handler a no-op. Prices here are sample store
 * strings; the real screens only ever show what the store returns.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture names, places and ids, never shipped copy. */
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import type { ProductOffer, ProductsState, PurchaseState } from '@/data/billing';
import { Grabber } from '@/ui/sheet/Grabber';
import { Scaffold } from '@/ui/surface/Scaffold';
import { useTheme } from '@/ui/theme';

import { boostModel, type BoostInput } from '../boost/boost-model';
import { BoostView } from '../boost/boost-view';
import { StampedView } from '../boost/stamped-view';
import { CompareView } from '../compare/compare-view';
import type { RestoreState } from '../data/use-billing';
import { paywallModel, type PaywallInput } from '../paywall/paywall-model';
import { PaywallView } from '../paywall/paywall-view';
import { compareRows } from '../perks/perk-copy';
import { WelcomeView } from '../welcome/welcome-view';
import { BOOST_PERKS, NO_RESTORE, noop, PASS_PERKS, PERKS } from './lab-fixtures';
import { CREW_SCENES } from './lab-scenes-crew';
import { PLAN_SCENES } from './lab-scenes-plan';

function offer(
  key: ProductOffer['key'],
  price: number,
  extra: Partial<ProductOffer> = {},
): ProductOffer {
  return {
    key,
    storeProductId: key,
    priceString: `$${price.toFixed(2)}`,
    price,
    currencyCode: 'USD',
    period: null,
    perMonthString: null,
    savingsPercent: null,
    ...extra,
  };
}

const READY: ProductsState = {
  status: 'ready',
  offers: {
    pass_monthly: offer('pass_monthly', 3.99, { period: { unit: 'month', count: 1 } }),
    pass_yearly: offer('pass_yearly', 29.99, {
      period: { unit: 'year', count: 1 },
      perMonthString: '$2.50',
      savingsPercent: 37,
    }),
    boost_trip: offer('boost_trip', 12, { priceString: '$12' }),
    boost_crew_year: offer('boost_crew_year', 59, {
      priceString: '$59',
      period: { unit: 'year', count: 1 },
    }),
  },
};

const IDLE: PurchaseState = { status: 'idle' };

function Dark({ children }: { readonly children: ReactNode }) {
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']}>
      {children}
    </Scaffold>
  );
}

/**
 * A sheet that fits its content, over a stand-in for the trip it opens on: the boost sheet is as
 * tall as what it has to say, so its short states are seen where they appear.
 */
function SheetFrame({ children }: { readonly children: ReactNode }) {
  const theme = useTheme();
  return (
    <Scaffold variant="dark" edges={[]}>
      <View style={{ flex: 1, backgroundColor: theme.color.rust.darkened }}>
        <View style={{ flex: 1, minHeight: 96 }} />
        <View
          style={{
            flexShrink: 1,
            backgroundColor: theme.semantic.bg.base,
            borderTopStartRadius: theme.radius.xl,
            borderTopEndRadius: theme.radius.xl,
          }}
        >
          <Grabber />
          {children}
        </View>
      </View>
    </Scaffold>
  );
}

function Paywall(input: Partial<PaywallInput> & { readonly restore?: RestoreState }) {
  const model = paywallModel({
    products: READY,
    purchase: IDLE,
    period: 'yearly',
    passPlus: false,
    online: true,
    ...input,
  });
  return (
    <Dark>
      <PaywallView
        model={model}
        holder="Winston"
        store="play"
        passPerks={PASS_PERKS.slice(0, 2)}
        boostPerks={BOOST_PERKS.slice(0, 3)}
        firstTripFree={{ crew: 'Bali Six', until: 'Oct 12–26' }}
        boostTrip={{ name: 'Kyoto' }}
        restore={input.restore ?? NO_RESTORE}
        onPeriod={noop}
        onBuy={noop}
        onCheckAgain={noop}
        onRestore={noop}
        onCompare={noop}
        onBoost={noop}
        onPlan={noop}
        onTerms={noop}
        onPrivacy={noop}
      />
    </Dark>
  );
}

function Compare({ products = READY }: { readonly products?: ProductsState }) {
  const model = paywallModel({
    products,
    purchase: IDLE,
    period: 'yearly',
    passPlus: false,
    online: true,
  });
  return (
    <Dark>
      <CompareView
        rows={compareRows(PERKS)}
        model={model}
        store="play"
        canBoost
        onBuy={noop}
        onCheckAgain={noop}
        onBoost={noop}
        onTerms={noop}
        onPrivacy={noop}
      />
    </Dark>
  );
}

const SEATED = ['Winston', 'Maya', 'Jordan', 'Rin', 'Dev', 'Alex'].map((name, index) => ({
  uid: `u${index}`,
  name,
}));

function Boost(over: Partial<BoostInput>) {
  const model = boostModel({
    products: READY,
    purchase: IDLE,
    online: true,
    option: 'trip',
    whoPays: 'split',
    trip: { status: 'planning', boostActive: false, endDate: '2027-04-09', solo: false },
    seated: SEATED,
    buyerUid: 'u0',
    lock: null,
    intentError: null,
    now: new Date('2026-11-02T00:00:00Z'),
    locale: 'en',
    ...over,
  });
  return (
    <SheetFrame>
      <ScrollView
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        <BoostView
          model={model}
          destination="Kyoto"
          crew="The Bali Six"
          dates="Apr 2–9"
          windowEnd="Apr 16"
          seated={SEATED}
          store="play"
          onOption={noop}
          onWhoPays={noop}
          onBuy={noop}
          onCheckAgain={noop}
          onTerms={noop}
          onPrivacy={noop}
        />
      </ScrollView>
    </SheetFrame>
  );
}

function Stamped({ boosted }: { readonly boosted: boolean }) {
  return (
    <StampedView
      boosted={boosted}
      destination="Kyoto"
      crew="The Bali Six"
      window="Apr 2–16"
      split
      onDone={noop}
    />
  );
}

export const MONETIZE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '4e-1-paywall': () => <Paywall />,
  '4e-1-not-available': () => <Paywall products={{ status: 'unavailable' }} />,
  '4e-1-pending': () => <Paywall purchase={{ status: 'pending', productKey: 'pass_yearly' }} />,
  '4e-1-paid-unconfirmed': () => (
    <Paywall
      purchase={{
        status: 'failed',
        productKey: 'pass_yearly',
        stage: 'verify',
        code: 'NETWORK',
        transactionId: 'fixture',
      }}
    />
  ),
  '4e-1-subscribed': () => <Paywall passPlus />,
  '4e-2-compare': () => <Compare />,
  '4e-2-not-available': () => <Compare products={{ status: 'unavailable' }} />,
  '4e-3-welcome': () => (
    <WelcomeView
      name="Winston"
      passPlus
      celebrate={false}
      admittedOn="02 Nov 2026"
      perks={PASS_PERKS.slice(0, 3)}
      renewal="Yearly · renews Nov 2, 2027"
      onPickIcon={noop}
      onDone={noop}
    />
  ),
  '4e-3-confirming': () => (
    <WelcomeView
      name="Winston"
      passPlus={false}
      celebrate={false}
      admittedOn="02 Nov 2026"
      perks={[]}
      renewal={null}
      onDone={noop}
    />
  ),
  ...PLAN_SCENES,
  '4b-3-boost': () => Boost({}),
  '4b-3-cover': () => Boost({ whoPays: 'cover' }),
  '4b-3-locked': () =>
    Boost({ lock: { buyerUid: 'u1', name: 'Maya', expiresAt: '2026-11-02T00:10:00Z' } }),
  '4b-3-already-boosted': () =>
    Boost({ trip: { status: 'planning', boostActive: true, endDate: '2027-04-09', solo: false } }),
  '4b-3-not-available': () => Boost({ products: { status: 'unavailable' } }),
  '4b-5-stamped': () => <Stamped boosted />,
  '4b-5-finishing': () => <Stamped boosted={false} />,
  ...CREW_SCENES,
};

export const MONETIZE_SCENE_NAMES = Object.keys(MONETIZE_SCENES);
