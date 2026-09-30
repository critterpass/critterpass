/**
 * The offer screen's data: live Viator products for the trip's day when the in-app booking is on
 * (fetched for this view only, never stored), else a partner link per supplier. Every link goes
 * out through `usePartnerLink` (click first, then the bridge on this build's host).
 */
import type { AffiliatePartner } from '@cp/domain';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { deviceSupplierApi, type SupplierApi, type WireOffer } from './data/api';
import type { PartnerLinkOutcome } from './data/partner-link';
import { usePartnerLink } from './data/use-partner-link';
import { useTripGuide } from './data/use-trip-guide';
import { OffersView } from './OffersView';
import { bookRoute } from './routes';
import { ACTIVITY_LINK_PARTNERS } from './suppliers';
import { useOfferCards } from './use-offer-cards';

export interface OfferParams {
  readonly tripId: string;
  /** The activity in our own words (the plan item or place name). */
  readonly name: string;
  readonly date?: string | undefined;
  /** Viator's destination id, when the caller knows it. */
  readonly destinationRef?: string | undefined;
  readonly currency?: string | undefined;
  /** The plan item this is for. */
  readonly stableId?: string | undefined;
}

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'offers'; readonly offers: readonly WireOffer[] }
  | { readonly kind: 'links'; readonly reason: 'off' | 'offline' | 'down' };

export function OffersScreen({
  params,
  api = deviceSupplierApi,
}: {
  readonly params: OfferParams;
  readonly api?: SupplierApi;
}) {
  const guide = useTripGuide(params.tripId);
  const openLink = usePartnerLink();
  const [load, setLoad] = useState<Load>(
    params.destinationRef && params.date ? { kind: 'loading' } : { kind: 'links', reason: 'off' },
  );
  const [pending, setPending] = useState<AffiliatePartner | null>(null);
  const [outcomes, setOutcomes] = useState<Partial<Record<AffiliatePartner, PartnerLinkOutcome>>>(
    {},
  );

  useEffect(() => {
    if (!params.destinationRef || !params.date) return undefined;
    let live = true;
    void api
      .offers({
        tripId: params.tripId,
        destinationRef: params.destinationRef,
        date: params.date,
        currency: params.currency ?? 'USD',
      })
      .then((outcome) => {
        if (!live) return;
        if (outcome.kind === 'ok' && outcome.value.length > 0)
          setLoad({ kind: 'offers', offers: outcome.value });
        else if (outcome.kind === 'offline') setLoad({ kind: 'links', reason: 'offline' });
        else if (outcome.kind === 'error' && outcome.code !== 'SUPPLIER_UNAVAILABLE')
          setLoad({ kind: 'links', reason: 'down' });
        else setLoad({ kind: 'links', reason: 'off' });
      });
    return () => {
      live = false;
    };
  }, [api, params.tripId, params.destinationRef, params.date, params.currency]);

  const open = async (partner: AffiliatePartner) => {
    setPending(partner);
    const outcome = await openLink({
      partner,
      tripId: params.tripId,
      target: {
        kind: 'activity',
        ref: params.stableId ?? params.name,
        query: params.name,
        ...(params.date ? { date: params.date } : {}),
      },
    });
    setPending(null);
    setOutcomes((all) => ({ ...all, [partner]: outcome }));
  };

  const cards = useOfferCards();
  const notice = cards.notice(load.kind === 'links' ? load.reason : null);

  return (
    <OffersView
      title={params.name}
      guide={guide.name}
      loading={load.kind === 'loading'}
      cards={
        load.kind === 'offers'
          ? load.offers.map((offer) =>
              cards.offerCard({
                offer,
                onBook: () =>
                  router.push(
                    bookRoute({
                      tripId: params.tripId,
                      product: offer.productCode,
                      title: offer.title,
                      date: params.date ?? '',
                      currency: params.currency ?? offer.priceFrom?.currency ?? 'USD',
                      ...(params.stableId ? { stableId: params.stableId } : {}),
                    }),
                  ),
              }),
            )
          : ACTIVITY_LINK_PARTNERS.map((partner) =>
              cards.linkCard({
                partner,
                name: params.name,
                pending: pending === partner,
                outcome: outcomes[partner],
                onOpen: () => void open(partner),
              }),
            )
      }
      notice={notice}
      onBack={() => router.back()}
    />
  );
}
