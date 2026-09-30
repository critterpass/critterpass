/**
 * Booking.com stays through CJ (Commission Junction) deep links: CJ's click host with our publisher
 * id and Booking.com's advertiser link id, the Booking.com search as `url`, and the click's opaque
 * sub id as CJ's `sid`, which CJ reports back with each commission.
 */
import { partnerPage, withParams, type LinkTarget } from '../links/link-spec';

export const BOOKING_HOSTS = ['booking.com'] as const;
const CJ_CLICK_HOST = 'https://www.anrdoezrs.net';

export interface CjBookingConfig {
  /** Our CJ publisher (website) id. */
  readonly publisherId: string;
  /** The Booking.com link id in CJ. */
  readonly adId: string;
}

export function bookingPage(target: LinkTarget): string {
  return (
    partnerPage(target, BOOKING_HOSTS) ??
    withParams('https://www.booking.com/searchresults.html', {
      ss: target.query,
      checkin: target.checkIn,
      checkout: target.checkOut,
      group_adults: target.adults,
      no_rooms: target.rooms,
    })
  );
}

export function bookingCjLink(config: CjBookingConfig, target: LinkTarget, subId: string): string {
  const click = new URL(
    `/click-${encodeURIComponent(config.publisherId)}-${encodeURIComponent(config.adId)}`,
    CJ_CLICK_HOST,
  );
  click.searchParams.set('sid', subId);
  click.searchParams.set('url', bookingPage(target));
  return click.toString();
}
