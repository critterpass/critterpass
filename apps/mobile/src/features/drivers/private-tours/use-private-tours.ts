/**
 * Private tours' state: the supplier cards and partner links fetched for this view only (never
 * kept), which cards are already in the comparison, and the actions (add a card to compare with
 * only its product id and the price shown, open a card or a partner search).
 */
import { currencyExponent, isKnownCurrency } from '@cp/cost-engine';
import { generateUuidV7 } from '@cp/domain';
import { useEffect, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { usePartnerLink } from '@/features/bookings';

import {
  deviceDriversApi,
  type Outcome,
  type PrivateTourCard,
  type PrivateTours,
} from '../shared/api';
import { shortlistCommand } from '../shared/commands';
import { splitDays } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';

export type TourLink = PrivateTours['links'][number];

export function usePrivateTours(tripId: string, days?: string) {
  const plan = useDriverDays(tripId);
  const openLink = usePartnerLink();
  const shortlist = useCommand(shortlistCommand);
  const [tours, setTours] = useState<Outcome<PrivateTours> | null>(null);
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let live = true;
    void deviceDriversApi.privateTours(tripId, splitDays(days)).then((outcome) => {
      if (live) setTours(outcome);
    });
    return () => {
      live = false;
    };
  }, [tripId, days]);
  const value = tours?.kind === 'ok' ? tours.value : null;
  const cards = value?.cards ?? [];
  const links = (value?.links ?? []).filter(
    (link) => !(link.partner === 'viator' && cards.length > 0),
  );
  const canAdd = (card: PrivateTourCard) =>
    !added.has(card.product_id) && card.price_from !== null && card.currency !== null;
  const add = (card: PrivateTourCard) => {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- currency code fallback, not copy.
    const currency = card.currency ?? 'USD';
    const exp = isKnownCurrency(currency) ? currencyExponent(currency) : 2;
    void shortlist
      .send({
        provider_id: generateUuidV7(),
        trip_id: tripId,
        supplier: 'viator',
        product_id: card.product_id,
        price_minor: Math.round((card.price_from ?? 0) * 10 ** exp),
        currency,
        price_unit: 'group',
        included_hours: null,
        seats: null,
      })
      .then((result) => {
        if (result.kind === 'applied') setAdded((prev) => new Set([...prev, card.product_id]));
      });
  };
  const openCard = (card: PrivateTourCard) =>
    void openLink({
      partner: 'viator',
      tripId,
      target: {
        kind: 'activity',
        ref: card.product_id,
        query: card.title.slice(0, 200),
        ...(card.product_url ? { page_url: card.product_url } : {}),
      },
    });
  const openPartner = (link: TourLink) =>
    void openLink({
      partner: link.partner,
      tripId,
      target: {
        kind: 'activity',
        // eslint-disable-next-line lingui/no-unlocalized-strings -- link ref, not copy.
        ref: `private-car:${link.partner}`,
        query: link.target.query,
        ...(link.target.date ? { date: link.target.date } : {}),
      },
    });
  return {
    plan,
    loading: tours === null,
    down: tours !== null && tours.kind !== 'ok',
    cards,
    links,
    added,
    canAdd,
    add,
    openCard,
    openPartner,
  };
}
