/**
 * One affiliate link per click: the partner's own page for the link, carrying our partner id and the
 * click's opaque sub id. Travelpayouts brands (Agoda, Trip.com, Klook, GetYourGuide, Kiwitaxi,
 * GetTransfer) go through its partner links API, Booking.com through CJ, Viator through its own
 * affiliate parameters. A partner whose programme is not configured or not subscribed answers
 * `SUPPLIER_UNAVAILABLE`: the app hides that call to action rather than show a link that is not
 * ours to attribute.
 */
import type { AffiliatePartner } from '@cp/domain';

import { supplierUnavailable } from '../core/errors';
import type { SupplierHttp } from '../core/http';
import { bookingCjLink, type CjBookingConfig } from '../booking-cj/links';
import { gygPage } from '../gyg/links';
import { getTransferPage, kiwitaxiPage } from '../transfers/links';
import { createPartnerLinks, type TravelpayoutsLinksConfig } from '../travelpayouts/links/client';
import { agodaPage, klookPage, tripComPage } from '../travelpayouts/links/partner-pages';
import { viatorAffiliateLink, type ViatorAffiliateConfig } from '../viator/links';
import type { LinkTarget } from './link-spec';

export interface AffiliateLinkConfig {
  readonly travelpayouts?: TravelpayoutsLinksConfig;
  readonly bookingCj?: CjBookingConfig;
  readonly viator?: ViatorAffiliateConfig;
}

const TRAVELPAYOUTS_PAGES: Partial<Record<AffiliatePartner, (target: LinkTarget) => string>> = {
  agoda: agodaPage,
  trip_com: tripComPage,
  klook: klookPage,
  gyg: gygPage,
  kiwitaxi: kiwitaxiPage,
  gettransfer: getTransferPage,
};

/** The partner's page for `target` before attribution (the click row keeps what we sent). */
export function partnerPageFor(partner: AffiliatePartner, target: LinkTarget): string | null {
  return TRAVELPAYOUTS_PAGES[partner]?.(target) ?? null;
}

export async function buildAffiliateLink(
  http: SupplierHttp,
  config: AffiliateLinkConfig,
  partner: AffiliatePartner,
  target: LinkTarget,
  subId: string,
): Promise<string> {
  if (partner === 'booking_cj') {
    if (config.bookingCj === undefined) throw supplierUnavailable(partner, 'not_configured');
    return bookingCjLink(config.bookingCj, target, subId);
  }
  if (partner === 'viator') {
    if (config.viator === undefined) throw supplierUnavailable(partner, 'not_configured');
    return viatorAffiliateLink(config.viator, target, subId);
  }
  const page = partnerPageFor(partner, target);
  if (page === null) throw supplierUnavailable(partner, 'no_link');
  if (config.travelpayouts === undefined) throw supplierUnavailable(partner, 'not_configured');
  const [result] = await createPartnerLinks(http, config.travelpayouts, [{ url: page, subId }]);
  if (result === undefined || !result.ok) {
    throw supplierUnavailable(partner, result?.ok === false ? result.reason : 'unsupported');
  }
  return result.partnerUrl;
}
