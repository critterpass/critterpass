/**
 * The partner's own page for a link, before Travelpayouts turns it into our affiliate link:
 * Agoda and Trip.com stay searches and Klook activity searches (dates and party size carried where
 * the partner's search reads them).
 */
import { partnerPage, withParams, type LinkTarget } from '../../links/link-spec';

export const AGODA_HOSTS = ['agoda.com'] as const;
export const TRIP_COM_HOSTS = ['trip.com'] as const;
export const KLOOK_HOSTS = ['klook.com'] as const;

export function agodaPage(target: LinkTarget): string {
  return (
    partnerPage(target, AGODA_HOSTS) ??
    withParams('https://www.agoda.com/search', {
      textToSearch: target.query,
      checkIn: target.checkIn,
      checkOut: target.checkOut,
      adults: target.adults,
      rooms: target.rooms,
    })
  );
}

export function tripComPage(target: LinkTarget): string {
  return (
    partnerPage(target, TRIP_COM_HOSTS) ??
    withParams('https://www.trip.com/hotels/list', {
      keyword: target.query,
      checkin: target.checkIn,
      checkout: target.checkOut,
      adult: target.adults,
    })
  );
}

export function klookPage(target: LinkTarget): string {
  return (
    partnerPage(target, KLOOK_HOSTS) ??
    withParams('https://www.klook.com/en-US/search/result/', { query: target.query })
  );
}
