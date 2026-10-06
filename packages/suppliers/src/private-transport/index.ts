/**
 * Private transport (6f-1): a car with a driver for the day from Klook or Viator, searched by
 * destination, day and party size. Supplier titles, photos and ratings are shown verbatim per view
 * and never stored or sent to a model; only the product id and the price shown can be kept, when
 * the traveller adds a tour to the comparison. Without a partner's API (Klook's switch off, or no
 * Viator destination for the trip) the card is a link row to the partner's own search, with no
 * prices or ratings of ours.
 */
import type { SupplierOffer } from '../core/adapter';
import type { LinkTarget } from '../links/link-spec';

export const PRIVATE_TRANSPORT_PARTNERS = ['klook', 'viator'] as const;
export type PrivateTransportPartner = (typeof PRIVATE_TRANSPORT_PARTNERS)[number];

/** Words a Viator title carries when the product is a private car or driver for the day. */
const PRIVATE_DRIVER = /\b(private (car|driver|tour|charter)|car charter|chauffeur|driver)\b/iu;

/** The partner search a link row opens: a private car with driver around `area`. */
export function privateTransportTarget(
  area: string,
  date: string | null,
  adults: number,
): LinkTarget {
  return {
    kind: 'activity',
    query: `private car charter with driver ${area}`.slice(0, 120),
    ...(date === null ? {} : { date }),
    ...(adults > 0 ? { adults } : {}),
  };
}

export interface PrivateTransportCard {
  readonly supplier: 'viator';
  readonly product_id: string;
  /** Verbatim, for this view only. */
  readonly title: string;
  /** The supplier's "from" price as shown, in major units. */
  readonly price_from: number | null;
  readonly currency: string | null;
  readonly product_url: string | null;
  readonly seen_at: string;
}

/** Viator products that are a private car or driver, in the supplier's own order and words. */
export function privateTransportCards(offers: readonly SupplierOffer[]): PrivateTransportCard[] {
  return offers
    .filter((offer) => PRIVATE_DRIVER.test(offer.title))
    .slice(0, 6)
    .map((offer) => ({
      supplier: 'viator',
      product_id: offer.productCode,
      title: offer.title,
      price_from: offer.priceFrom?.amount ?? null,
      currency: offer.priceFrom?.currency ?? null,
      product_url: offer.productUrl,
      seen_at: offer.seenAt,
    }));
}
