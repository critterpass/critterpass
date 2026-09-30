/** Supplier lab scenes for Getting around (3h-3), its ride card states and its two sheets. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { ALL_PARTNERS_OFF, supplierCopy, type RideQuoteResult } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

import { EstimateSheet } from '../../getting-around/EstimateSheet';
import { glossMessage } from '../../getting-around/phrase';
import {
  GettingAroundView,
  type GettingAroundViewProps,
} from '../../getting-around/GettingAroundView';
import { LogRideSheet } from '../../getting-around/LogRideSheet';
import { rideCard } from '../../getting-around/ride-card';
import type { QuoteState, SyncedQuote } from '../../getting-around/use-getting-around';
import { useSupplierCopy } from '../copy';
import { KYOTO_TAXI_ESTIMATE } from './fare-fixtures';

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
  fare_estimate: null,
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
const KYOTO: RideQuoteResult = {
  copy_key: 'suppliers.rides.open_app',
  estimate: null,
  fare_estimate: KYOTO_TAXI_ESTIMATE,
  links: [{ provider: 'uber', app_url: 'uber://', fallback_url: 'https://m.uber.com' }],
  phrase_card: { poi_id: 'k', name: 'Kinkaku-ji', name_local: '金閣寺', address: null },
};

function EstimateScene() {
  const { t } = useLingui();
  const locale = useLocale();
  const option = KYOTO_TAXI_ESTIMATE.options[0];
  return option === undefined
    ? null
    : sheet(
        <EstimateSheet option={option} locale={locale} />,
        t({ id: 'suppliers.estimate.title', message: 'Why this estimate' }),
        'supplier-estimate-sheet',
      );
}

function LogScene() {
  const { t } = useLingui();
  return sheet(
    <LogRideSheet
      params={{
        tripId: '00000000-0000-7000-8000-000000000000',
        legRef: 'l1',
        provider: 'grab',
        currency: 'IDR',
        attendees: ['a', 'b', 'c', 'd', 'e', 'f'],
      }}
    />,
    t({ id: 'suppliers.log.title', message: 'Log the ride' }),
    'supplier-log-ride-sheet',
  );
}

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
  /** Kyoto Station to Kinkaku-ji instead of the Bali airport run. */
  readonly kyoto?: boolean;
}

const STATION = { lat: 34.9858, lng: 135.7588 };
const KINKAKU = { lat: 35.0394, lng: 135.7292, label: 'Kinkaku-ji' };

function AroundScene({
  quote,
  synced = null,
  transfer = false,
  journey = 'ready',
  status = 'ready',
  kyoto = false,
}: SceneProps) {
  const { t, i18n } = useLingui();
  const render = useSupplierCopy();
  const locale = useLocale();
  const hours = kyoto ? 0 : 1;
  const rest = kyoto ? '28' : '05';
  // The same place as the local line: Kyoto's phrase names the temple alone.
  const place = kyoto ? 'Kinkaku-ji' : 'Villa Kayu Manis, Jalan Raya Sayan, Ubud';
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
      header={`${kyoto ? 'Kyoto Station → Kinkaku-ji' : 'Airport → Villa Kayu Manis'} · ${t({ id: 'suppliers.around.hours', message: `${hours}h ${rest}m` })}`}
      map={{
        from: kyoto ? STATION : AIRPORT,
        to: kyoto ? KINKAKU : VILLA,
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
        phrase: kyoto
          ? '金閣寺までお願いします。'
          : 'Tolong antar kami ke Villa Kayu Manis, Jalan Raya Sayan, Ubud.',
        lang: kyoto ? 'ja' : 'id',
        gloss: i18n._(glossMessage(place)),
        eyebrow: render(supplierCopy({ action: 'ride', state: 'phrase_card' }, ALL_PARTNERS_OFF)),
      }}
      later={
        kyoto
          ? []
          : [
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
            ]
      }
      {...(kyoto ? { guide: { id: 'pon', name: 'Pon' } } : {})}
    />
  );
}

function sheet(children: ReactNode, title: string, testID: string) {
  return (
    <Sheet detents={['fit']} title={title} testID={testID}>
      <SheetScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {children}
      </SheetScrollView>
    </Sheet>
  );
}

export const AROUND_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'around-kyoto-estimate': () => <AroundScene kyoto quote={{ kind: 'ready', quote: KYOTO }} />,
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
  'around-estimate-why': () => <EstimateScene />,
  'around-log-ride': () => <LogScene />,
};
