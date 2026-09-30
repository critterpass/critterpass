/**
 * Getting around's container: turns the day's data and the ride quote into the view, opens ride
 * apps with the trip pre-filled, and sends the log and "why this estimate" sheets.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and wire values. */
import { ALL_PARTNERS_OFF, rideAppsFor, supplierCopy } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { clock, dateTime } from '../format';
import { bookingRoute } from '../routes';
import { useSupplierCopy } from '../supplier/copy';
import { deviceSupplierApi } from '../supplier/data/api';
import { useTripGuide } from '../supplier/data/use-trip-guide';
import { rideAppName } from '../supplier/suppliers';
import { GettingAroundView } from './GettingAroundView';
import type { Leg } from './model';
import { driverPhrase, glossMessage } from './phrase';
import { rideCard } from './ride-card';
import { openRideLink } from './ride-links';
import { estimateRoute, logRideRoute } from './routes';
import { useGettingAround } from './use-getting-around';

export function GettingAroundScreen({
  ask,
}: {
  readonly ask: { readonly tripId?: string; readonly to?: string; readonly from?: string };
}) {
  const data = useGettingAround(ask);
  const guide = useTripGuide(data.tripId);
  const { t, i18n } = useLingui();
  const locale = useLocale();
  const render = useSupplierCopy();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [tick, setTick] = useState<number | null>(null);
  useEffect(() => {
    if (startedAt === null) return undefined;
    const timer = setInterval(() => setTick(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [startedAt]);
  const to = data.leg.to;
  const from = data.leg.from ?? data.here;

  const duration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const rest = String(minutes % 60).padStart(2, '0');
    return hours > 0
      ? t({ id: 'suppliers.around.hours', message: `${hours}h ${rest}m` })
      : t({ id: 'suppliers.around.minutes', message: `${minutes} min` });
  };
  const header =
    to === null
      ? null
      : [
          data.leg.from ? `${data.leg.from.name} → ${to.name}` : to.name,
          data.driveMinutes === null ? null : duration(data.driveMinutes),
        ]
          .filter((part): part is string => part !== null)
          .join(' · ');

  const logLeg = (
    legRef: string,
    provider: string,
    attendees: readonly string[],
    quoteId?: string,
  ) =>
    router.push(
      logRideRoute({
        tripId: data.tripId ?? '',
        legRef,
        provider,
        currency: data.localCurrency ?? '',
        attendees: attendees.join(','),
        ...(quoteId ? { quoteId } : {}),
      }),
    );

  const ride = rideCard(data, {
    tr: (d) => i18n._(d),
    render,
    locale,
    onWhy: (q) => router.push(estimateRoute(q)),
  });
  const phrase = to === null ? null : driverPhrase(to, data.country);
  const place = phrase?.placeForGloss ?? '';
  const apps = rideAppsFor(data.country);
  const later = data.leg.later.map((leg: Leg) => ({
    key: leg.key,
    from: leg.from.name,
    to: leg.to.name,
    detail: t({
      id: 'suppliers.later.at',
      message: `At ${clock(locale, leg.to.startsAt, data.tz)}`,
    }),
    openLabel: apps[0]
      ? render(
          supplierCopy(
            { action: 'ride', state: 'links', app: rideAppName(apps[0]) },
            ALL_PARTNERS_OFF,
          ),
        )
      : null,
    onOpen: () => {
      if (data.tripId === null) return;
      void deviceSupplierApi
        .rideQuote({ tripId: data.tripId, toPoi: leg.to.poiId, fromPoi: leg.from.poiId })
        .then((outcome) => {
          const link = outcome.kind === 'ok' ? outcome.value.links[0] : undefined;
          if (link) openRideLink(link);
        });
    },
    onLog: () => logLeg(leg.key, apps[0] ?? 'taxi', leg.to.attendeeIds),
    testID: `getting-around-later-${leg.key}`,
  }));
  const quote = data.quote.kind === 'ready' ? data.quote.quote : null;

  return (
    <GettingAroundView
      status={data.status}
      guide={guide}
      header={header}
      map={
        to === null
          ? null
          : {
              from,
              to: { lat: to.lat, lng: to.lng, label: to.name },
              destinationSlug: null,
              carShare:
                startedAt === null
                  ? null
                  : Math.min(
                      1,
                      ((tick ?? startedAt) - startedAt) /
                        Math.max(1, (data.driveMinutes ?? 1) * 60_000),
                    ),
            }
      }
      transfer={
        data.transfer === null
          ? null
          : {
              transfer: data.transfer,
              line: render(
                supplierCopy(
                  {
                    action: 'ride',
                    state: 'transfer',
                    supplier: data.transfer.supplier ?? data.transfer.title,
                  },
                  ALL_PARTNERS_OFF,
                ),
              ),
              when: data.transfer.startsAt
                ? dateTime(locale, data.transfer.startsAt, data.tz)
                : null,
              onOpen: () => {
                if (data.transfer) router.push(bookingRoute(data.transfer.id));
              },
            }
      }
      ride={ride}
      journey={{
        minutes: data.driveMinutes,
        startedAt,
        onStart: () => {
          const now = Date.now();
          setStartedAt(now);
          setTick(now);
        },
        onLog: () =>
          logLeg(
            to !== null && 'stableId' in to ? to.stableId : (to?.poiId ?? ''),
            quote?.estimate ? 'grab' : (apps[0] ?? 'taxi'),
            to !== null && 'attendeeIds' in to ? to.attendeeIds : [],
            quote?.estimate?.quote_id,
          ),
      }}
      phrase={
        phrase === null || to === null
          ? null
          : {
              phrase: phrase.phrase,
              lang: phrase.lang,
              gloss: i18n._(glossMessage(place)),
              eyebrow: render(
                supplierCopy({ action: 'ride', state: 'phrase_card' }, ALL_PARTNERS_OFF),
              ),
            }
      }
      later={later}
      onBack={() => router.back()}
    />
  );
}
