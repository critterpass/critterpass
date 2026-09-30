/** Supplier names as the partners write them (brand names, never translated). */
/* eslint-disable lingui/no-unlocalized-strings -- brand names. */
import type { AffiliatePartner } from '@cp/domain';

export const SUPPLIER_NAMES: Readonly<Record<AffiliatePartner, string>> = {
  agoda: 'Agoda',
  trip_com: 'Trip.com',
  booking_cj: 'Booking.com',
  klook: 'Klook',
  gyg: 'GetYourGuide',
  kiwitaxi: 'Kiwitaxi',
  gettransfer: 'GetTransfer',
  viator: 'Viator',
  grab: 'Grab',
  travelpayouts: 'Travelpayouts',
};

/** Where an activity can be opened by link, in the fixed order cards show them. */
export const ACTIVITY_LINK_PARTNERS: readonly AffiliatePartner[] = ['klook', 'viator'];

/** Ride apps by provider key, as the apps write their names. */
export function rideAppName(provider: string): string {
  return provider === 'grab'
    ? 'Grab'
    : provider === 'gojek'
      ? 'Gojek'
      : provider === 'uber'
        ? 'Uber'
        : provider;
}
