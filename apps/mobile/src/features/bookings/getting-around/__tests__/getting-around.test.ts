/**
 * Getting around: the leg is the place asked for or the next stop today, later legs follow the
 * plan, the journey is an estimate by elapsed time, the phrase is in the drivers' language, and the
 * ride card shows Grab's estimate only when Grab gave one: never a driver or a booked car.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

import { describe, expect, it, jest } from '@jest/globals';

import type { RideQuoteResult, SupplierCopy } from '@cp/domain';
import type { MessageDescriptor } from '@lingui/core';
import { renderSupplierCopyEn } from '@cp/domain';

import { KYOTO_TAXI_ESTIMATE } from '../../supplier/dev/fare-fixtures';
import { toMinor } from '../LogRideSheet';
import { chooseLeg, journeyProgress, nextTransfer, todaysStops, type PlanStop } from '../model';
import { driverPhrase } from '../phrase';
import { rideCard } from '../ride-card';

const TZ = 'Asia/Makassar';
const NOW = new Date('2026-10-16T03:00:00Z'); // 11:00 in Bali

function stop(id: string, startsAt: string): PlanStop {
  return {
    poiId: `poi-${id}`,
    stableId: `s-${id}`,
    name: id,
    nameLocal: null,
    address: null,
    lat: -8.5,
    lng: 115.2,
    startsAt,
    attendeeIds: ['u1', 'u2'],
  };
}

const DAY = [
  stop('villa', '2026-10-16T01:00:00Z'),
  stop('warung', '2026-10-16T04:30:00Z'),
  stop('spa', '2026-10-16T07:00:00Z'),
  stop('tomorrow', '2026-10-17T02:00:00Z'),
];

describe('the leg', () => {
  it('takes the next stop today, from the one before, with the rest as later legs', () => {
    const today = todaysStops(DAY, NOW, TZ);
    expect(today.map((s) => s.name)).toEqual(['villa', 'warung', 'spa']);
    const leg = chooseLeg(today, NOW, {});
    expect(leg.to?.name).toBe('warung');
    expect(leg.from?.name).toBe('villa');
    expect(leg.later.map((l) => `${l.from.name}→${l.to.name}`)).toEqual(['warung→spa']);
  });

  it('takes the place asked for, from the phone when nothing comes before', () => {
    const asked = { ...DAY[0]!, poiId: 'poi-airport', name: 'airport' };
    const leg = chooseLeg(todaysStops(DAY, NOW, TZ), NOW, { toPoi: asked });
    expect(leg.to?.name).toBe('airport');
    expect(leg.from).toBeNull();
  });

  it('shows the next transfer still ahead', () => {
    const transfers = [
      {
        id: 'a',
        title: 'Old',
        supplier: 'Klook',
        startsAt: '2026-10-15T01:00:00Z',
        operator: null,
        meetingPoint: null,
      },
      {
        id: 'b',
        title: 'Pickup',
        supplier: 'Klook',
        startsAt: '2026-10-16T02:30:00Z',
        operator: 'Made',
        meetingPoint: null,
      },
    ];
    expect(nextTransfer(transfers, NOW)?.id).toBe('b');
  });

  it('estimates the journey by elapsed time only', () => {
    expect(journeyProgress(0, 20, 5 * 60_000)).toEqual({ share: 0.25, minutesLeft: 15 });
    expect(journeyProgress(0, 20, 40 * 60_000)).toEqual({ share: 1, minutesLeft: 0 });
  });
});

describe('the phrase for the driver', () => {
  it('asks in the local language around the local-script address', () => {
    const place = {
      poiId: 'p',
      name: 'Villa Kayu Manis',
      nameLocal: null,
      address: 'Jalan Raya Sayan, Ubud',
      lat: 0,
      lng: 0,
    };
    expect(driverPhrase(place, 'ID')).toEqual({
      phrase: 'Tolong antar kami ke Villa Kayu Manis, Jalan Raya Sayan, Ubud.',
      lang: 'id',
      placeForGloss: 'Villa Kayu Manis, Jalan Raya Sayan, Ubud',
    });
    expect(driverPhrase({ ...place, nameLocal: '金閣寺', address: null }, 'Japan').phrase).toBe(
      '金閣寺までお願いします。',
    );
    expect(driverPhrase(place, 'Iceland').phrase).toBe('Villa Kayu Manis, Jalan Raya Sayan, Ubud');
  });
});

/** Renders a descriptor's English with its values, as `i18n._` does without a catalogue. */
const tr = (descriptor: MessageDescriptor) =>
  (descriptor.message ?? '').replace(/\{(\w+)\}/gu, (_, name: string) =>
    String((descriptor.values?.[name] as string | number | undefined) ?? ''),
  );
const render = (copy: SupplierCopy) => renderSupplierCopyEn(copy);
const deps = { tr, render, locale: 'en', onWhy: () => undefined };
const LINKS = [
  { provider: 'grab', app_url: 'grab://open', fallback_url: 'https://grab.com' },
] as const;
const base: RideQuoteResult = {
  copy_key: 'suppliers.rides.open_app',
  estimate: null,
  fare_estimate: null,
  links: LINKS,
  phrase_card: { poi_id: 'p', name: 'Villa', name_local: null, address: null },
};

const GRAB = {
  quote_id: 'q',
  provider: 'grab',
  service: 'GrabCar',
  eta_min: 4,
  fare_low_minor: 9_000_000,
  fare_high_minor: 12_000_000,
  currency: 'IDR',
  surge: 'none',
  fetched_at: '2026-10-16T03:00:00Z',
  deep_link: 'grab://x',
} as const;

describe('the ride card', () => {
  it('shows Grab’s own estimate only when Grab gave one', () => {
    const estimate = {
      quote_id: 'q',
      provider: 'grab',
      service: 'GrabCar',
      eta_min: 4,
      fare_low_minor: 9_000_000,
      fare_high_minor: 12_000_000,
      currency: 'IDR',
      surge: 'none',
      fetched_at: '2026-10-16T03:00:00Z',
      deep_link: 'grab://x',
    } as const;
    const card = rideCard(
      { quote: { kind: 'ready', quote: { ...base, estimate } }, synced: null, tz: TZ },
      deps,
    );
    expect(card?.state).toBe('estimate');
    expect(card?.title).toMatch(/^Grab estimates .*90.*120.*, about 4 min away$/u);
    const links = rideCard({ quote: { kind: 'ready', quote: base }, synced: null, tz: TZ }, deps);
    expect(links?.state).toBe('links');
    expect(links?.apps.map((a) => a.label)).toEqual(['Open Grab']);
    for (const c of [card, links])
      expect(JSON.stringify(c)).not.toMatch(/driver is|booked by|min away · booked/iu);
  });

  it('adds our tariff range as an estimate, with extras on their own lines, only without Grab’s', () => {
    const quote = { ...base, fare_estimate: KYOTO_TAXI_ESTIMATE };
    const card = rideCard({ quote: { kind: 'ready', quote }, synced: null, tz: TZ }, deps);
    const fare = card?.fares?.[0];
    expect(fare?.label).toBe('MK Taxi · Metered taxi');
    expect(fare?.line).toMatch(/^About .*3,400.*4,300 · estimate$/u);
    expect(fare?.line).not.toMatch(/420/u);
    expect(fare?.crew).toMatch(/23.*29/u);
    expect(fare?.extras).toEqual([
      expect.stringMatching(/^\+ .*420 if you book by phone or app$/u),
    ]);
    const withGrab = rideCard(
      { quote: { kind: 'ready', quote: { ...quote, estimate: GRAB } }, synced: null, tz: TZ },
      deps,
    );
    expect(withGrab?.fares).toEqual([]);
  });

  it('falls back to the last synced quote without signal', () => {
    const card = rideCard(
      {
        quote: { kind: 'offline' },
        synced: {
          fare_low_minor: 9_000_000,
          fare_high_minor: 12_000_000,
          currency: 'IDR',
          eta_min: 4,
          fetched_at: '2026-10-16T02:10:00Z',
        },
        tz: TZ,
      },
      deps,
    );
    expect(card?.state).toBe('offline');
    expect(card?.detail).toMatch(/^At 10:10 Grab estimated .*90.*120/u);
  });
});

describe('logging a ride', () => {
  it('reads amounts in the currency’s own units', () => {
    expect(toMinor('60.000', 'IDR')).toBe(6_000_000);
    expect(toMinor('12,50', 'USD')).toBe(1250);
    expect(toMinor('abc', 'USD')).toBeNull();
    expect(toMinor('', 'USD')).toBeNull();
  });
});
