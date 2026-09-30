/** Supplier lab scenes for Getting around (3h-3), its ride card states and its two sheets. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { ALL_PARTNERS_OFF, supplierCopy, type RideQuoteResult } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Scaffold } from '@/ui/surface/Scaffold';

import { EstimateSheet } from '../../getting-around/EstimateSheet';
import {
  GettingAroundView,
  type GettingAroundViewProps,
} from '../../getting-around/GettingAroundView';
import { LogRideSheet } from '../../getting-around/LogRideSheet';
import { rideCard } from '../../getting-around/ride-card';
import type { QuoteState, SyncedQuote } from '../../getting-around/use-getting-around';
import { useSupplierCopy } from '../copy';

const noop = () => undefined;
/** The lab's clock, read once when the lab loads. */
const LAB_NOW = Date.now();
const TZ = 'Asia/Makassar';
const AIRPORT = { lat: -8.7482, lng: 115.1672 };
const VILLA = { lat: -8.5069, lng: 115.2625, label: 'Villa Kayu Manis' };
const LINKS = [
  { provider: 'grab', app_url: 'grab://open', fallback_url: 'https://www.grab.com' },
  { provider: 'gojek', app_url: 'gojek://', fallback_url: 'https://www.gojek.com' },
] as const;
const BASE: RideQuoteResult = {
  copy_key: 'suppliers.rides.open_app',
  estimate: null,
  links: LINKS,
  phrase_card: {
    poi_id: 'p',
    name: 'Villa Kayu Manis',
    name_local: null,
    address: 'Jalan Raya Sayan, Ubud',
  },
};
const GRAB: RideQuoteResult = {
  ...BASE,
  copy_key: 'suppliers.rides.grab_estimate',
  estimate: {
    quote_id: 'q1',
    provider: 'grab',
    service: 'GrabCar',
    eta_min: 4,
    fare_low_minor: 28_000_000,
    fare_high_minor: 35_000_000,
    currency: 'IDR',
    surge: 'none',
    fetched_at: new Date().toISOString(),
    deep_link: 'grab://open?screenType=BOOKING',
  },
};
const FARE = {
  fare_estimate: {
    low_minor: 25_000_000,
    high_minor: 35_000_000,
    currency: 'IDR',
    crew: { low_minor: 1600, high_minor: 2200, currency: 'USD' },
    basis: 'Airport taxi counter tariff to Ubud, plus what crews paid on Grab last month.',
    sources: ['Ngurah Rai airport taxi tariff board', 'Crew ride logs, September 2026'],
    checked_at: '2026-09-28T00:00:00Z',
    reviewed: true,
  },
};
const SYNCED: SyncedQuote = {
  fare_low_minor: 28_000_000,
  fare_high_minor: 35_000_000,
  currency: 'IDR',
  eta_min: 4,
  fetched_at: '2026-10-16T01:10:00Z',
};

interface SceneProps {
  readonly quote: QuoteState;
  readonly synced?: SyncedQuote | null;
  readonly transfer?: boolean;
  readonly journey?: 'none' | 'ready' | 'running' | 'arrived';
  readonly status?: GettingAroundViewProps['status'];
}

function AroundScene({
  quote,
  synced = null,
  transfer = false,
  journey = 'ready',
  status = 'ready',
}: SceneProps) {
  const { t, i18n } = useLingui();
  const render = useSupplierCopy();
  const locale = useLocale();
  const hours = 1;
  const rest = '05';
  const startedAt =
    journey === 'running'
      ? LAB_NOW - 20 * 60_000
      : journey === 'arrived'
        ? LAB_NOW - 90 * 60_000
        : null;
  return (
    <GettingAroundView
      status={status}
      guide={{ id: 'tokek', name: 'Tokek' }}
      header={`Airport → Villa Kayu Manis · ${t({ id: 'suppliers.around.hours', message: `${hours}h ${rest}m` })}`}
      map={{
        from: AIRPORT,
        to: VILLA,
        destinationSlug: null,
        carShare: journey === 'running' ? 0.3 : null,
      }}
      transfer={
        transfer
          ? {
              transfer: {
                id: 'b1',
                title: 'Airport pickup, Ngurah Rai arrivals',
                supplier: 'Klook',
                startsAt: '2026-10-16T02:40:00Z',
                operator: 'Bali Sun Transport',
                meetingPoint: 'Arrivals hall, exit 2',
              },
              line: render(
                supplierCopy(
                  { action: 'ride', state: 'transfer', supplier: 'Klook' },
                  ALL_PARTNERS_OFF,
                ),
              ),
              when: 'Thu 16 Oct, 10:40',
              onOpen: noop,
            }
          : null
      }
      ride={
        transfer
          ? null
          : rideCard(
              { quote, synced, tz: TZ },
              { tr: (d) => i18n._(d), render, locale, onWhy: noop },
            )
      }
      journey={journey === 'none' ? null : { minutes: 65, startedAt, onStart: noop, onLog: noop }}
      phrase={{
        phrase: 'Tolong antar kami ke Villa Kayu Manis, Jalan Raya Sayan, Ubud.',
        lang: 'id',
        gloss: t({
          id: 'suppliers.around.gloss',
          message: `Please take us to ${'Villa Kayu Manis, Jalan Raya Sayan, Ubud'}.`,
        }),
        eyebrow: render(supplierCopy({ action: 'ride', state: 'phrase_card' }, ALL_PARTNERS_OFF)),
      }}
      later={[
        {
          key: 'l1',
          from: 'Villa',
          to: 'Warung Biah Biah',
          detail: t({ id: 'suppliers.later.at', message: `At ${'19:30'}` }),
          openLabel: render(
            supplierCopy({ action: 'ride', state: 'links', app: 'Grab' }, ALL_PARTNERS_OFF),
          ),
          onOpen: noop,
          onLog: noop,
        },
      ]}
    />
  );
}

function sheet(children: ReactNode) {
  return (
    <Scaffold variant="dark">
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24 }}>{children}</ScrollView>
    </Scaffold>
  );
}

export const AROUND_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'around-links-estimate': () => (
    <AroundScene quote={{ kind: 'ready', quote: { ...BASE, ...FARE } }} />
  ),
  'around-links': () => <AroundScene quote={{ kind: 'ready', quote: BASE }} />,
  'around-grab-estimate': () => <AroundScene quote={{ kind: 'ready', quote: GRAB }} />,
  'around-transfer': () => <AroundScene quote={{ kind: 'idle' }} transfer />,
  'around-journey': () => <AroundScene quote={{ kind: 'ready', quote: BASE }} journey="running" />,
  'around-arrived': () => <AroundScene quote={{ kind: 'ready', quote: BASE }} journey="arrived" />,
  'around-offline': () => (
    <AroundScene quote={{ kind: 'offline' }} synced={SYNCED} journey="none" />
  ),
  'around-no-apps': () => (
    <AroundScene quote={{ kind: 'ready', quote: { ...BASE, links: [] } }} journey="none" />
  ),
  'around-loading': () => <AroundScene quote={{ kind: 'loading' }} journey="none" />,
  'around-no-place': () => <AroundScene quote={{ kind: 'idle' }} status="no_place" />,
  'around-estimate-why': () =>
    sheet(
      <EstimateSheet
        basis={FARE.fare_estimate.basis}
        sources={FARE.fare_estimate.sources.map((name) => ({ name }))}
        checked="28 Sep 2026"
        reviewed
      />,
    ),
  'around-log-ride': () =>
    sheet(
      <LogRideSheet
        params={{
          tripId: '00000000-0000-7000-8000-000000000000',
          legRef: 'l1',
          provider: 'grab',
          currency: 'IDR',
          attendees: ['a', 'b', 'c', 'd', 'e', 'f'],
        }}
      />,
    ),
};
