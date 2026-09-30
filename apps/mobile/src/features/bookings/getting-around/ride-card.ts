/**
 * The ride card's props from the quote: Grab's own estimate, the ride apps as links, none where no
 * app runs, or the last quote this phone synced when there's no signal. Our fare range rides along
 * labelled as an estimate whenever the api has one.
 */
import { ALL_PARTNERS_OFF, supplierCopy, type RideQuoteResult } from '@cp/domain';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Linking } from 'react-native';

import { clock, price } from '../format';
import type { useSupplierCopy } from '../supplier/copy';
import { rideAppName } from '../supplier/suppliers';
import { readFareEstimate } from './fare-estimate';
import type { GrabEstimateCardProps } from './GrabEstimateCard';
import { openRideLink } from './ride-links';
import type { GettingAround } from './use-getting-around';

interface RideCardDeps {
  /** Renders a catalogue message (`i18n._`). */
  readonly tr: (descriptor: MessageDescriptor) => string;
  readonly render: ReturnType<typeof useSupplierCopy>;
  readonly locale: string;
  readonly onWhy: (quote: RideQuoteResult) => void;
}

/** The ride card from the quote state (Grab's estimate, links, none, or the last synced quote). */
export function rideCard(
  data: Pick<GettingAround, 'quote' | 'synced' | 'tz'>,
  deps: RideCardDeps,
): GrabEstimateCardProps | null {
  const { tr, render, locale } = deps;
  if (data.quote.kind === 'idle') return null;
  if (data.quote.kind === 'loading') return { state: 'loading', title: '', apps: [] };
  if (data.quote.kind !== 'ready') {
    const s = data.synced;
    const seen = s ? clock(locale, s.fetched_at, data.tz) : null;
    const fares =
      s?.fare_low_minor != null && s.fare_high_minor != null && s.currency
        ? `${price(locale, s.fare_low_minor, s.currency)}–${price(locale, s.fare_high_minor, s.currency)}`
        : null;
    return {
      state: 'offline',
      title: tr(msg({ id: 'suppliers.rides.offlineTitle', message: 'No signal right now' })),
      detail:
        fares && seen
          ? tr(
              msg({
                id: 'suppliers.rides.offlineLast',
                message: `At ${seen} Grab estimated ${fares}. The card below works offline.`,
              }),
            )
          : tr(
              msg({
                id: 'suppliers.rides.offlineNone',
                message: 'The card below works offline: show it to any driver.',
              }),
            ),
      apps: [],
    };
  }
  const quote = data.quote.quote;
  const estimate =
    quote.estimate?.provider === 'grab' && 'deep_link' in quote.estimate ? quote.estimate : null;
  const fare = readFareEstimate(quote);
  const fareLine = fare
    ? tr(
        msg({
          id: 'suppliers.rides.fareEstimate',
          message: `About ${price(locale, fare.low_minor, fare.currency)}–${price(locale, fare.high_minor, fare.currency)} · estimate`,
        }),
      ) +
      (fare.crew
        ? ` (≈ ${price(locale, fare.crew.low_minor, fare.crew.currency)}–${price(locale, fare.crew.high_minor, fare.crew.currency)})`
        : '')
    : null;
  const apps = quote.links.map((link) => ({
    key: link.provider,
    label: render(
      supplierCopy(
        { action: 'ride', state: 'links', app: rideAppName(link.provider) },
        ALL_PARTNERS_OFF,
      ),
    ),
    onPress: () => openRideLink(link),
  }));
  const fareProp = fareLine ? { line: fareLine, onWhy: () => deps.onWhy(quote) } : null;
  if (estimate) {
    return {
      state: 'estimate',
      title: render(
        supplierCopy(
          {
            action: 'ride',
            state: 'estimate',
            low: price(locale, estimate.fare_low_minor, estimate.currency),
            high: price(locale, estimate.fare_high_minor, estimate.currency),
            minutes: estimate.eta_min,
          },
          ALL_PARTNERS_OFF,
        ),
      ),
      detail:
        estimate.surge === 'none'
          ? tr(
              msg({
                id: 'suppliers.rides.seen',
                message: `Checked at ${clock(locale, estimate.fetched_at, data.tz)}`,
              }),
            )
          : tr(
              msg({
                id: 'suppliers.rides.surge',
                message: `Fares are up right now · checked at ${clock(locale, estimate.fetched_at, data.tz)}`,
              }),
            ),
      fare: fareProp,
      apps: [
        {
          key: 'grab',
          label: render(
            supplierCopy({ action: 'ride', state: 'links', app: 'Grab' }, ALL_PARTNERS_OFF),
          ),
          onPress: () => void Linking.openURL(estimate.deep_link).catch(() => undefined),
        },
        ...apps.filter((a) => a.key !== 'grab'),
      ],
    };
  }
  if (apps.length > 0) {
    return {
      state: 'links',
      title: tr(msg({ id: 'suppliers.rides.callCar', message: 'Call a car' })),
      detail: tr(
        msg({
          id: 'suppliers.rides.linksDetail',
          message: 'Opens the app with the drop-off filled in. We don’t book the car.',
        }),
      ),
      fare: fareProp,
      apps,
    };
  }
  return {
    state: 'none',
    title: tr(msg({ id: 'suppliers.rides.noApps', message: 'No ride apps here' })),
    detail: tr(
      msg({
        id: 'suppliers.rides.noAppsDetail',
        message: 'Show a taxi driver the card below.',
      }),
    ),
    fare: fareProp,
    apps: [],
  };
}
