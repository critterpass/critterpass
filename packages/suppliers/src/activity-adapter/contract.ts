/**
 * The activity adapter contract every in-app activity partner plugs into (Viator today; GetYourGuide,
 * Klook and Trip.com when their partner APIs are approved, each behind its own partner switch):
 * search, book, status, cancel quote and cancel are required; a hold is optional, and a partner
 * without one runs the same order flow on the "Book now · seats not held" path. Nothing here
 * charges a card: the partner is the merchant of record.
 */
import type { PartnerKey } from '@cp/domain';

import type { SupplierAdapter } from '../core/adapter';

export type ActivityAdapter = SupplierAdapter &
  Required<Pick<SupplierAdapter, 'search' | 'book' | 'status' | 'cancelQuote' | 'cancel'>>;

/** Each activity partner's switch in `ops.partner_adapters` (off until approval). */
export const ACTIVITY_PARTNER_FLAGS = {
  viator: 'viator_booking',
  gyg: 'gyg_api',
  klook: 'klook_activity',
  tripcom: 'trip_com_at',
} as const satisfies Readonly<Record<string, PartnerKey>>;

/** Whether `adapter` implements every method its capabilities claim, and nothing it disclaims. */
export function capabilityMismatches(adapter: SupplierAdapter): string[] {
  const claims: [keyof SupplierAdapter['capabilities'], boolean][] = [
    ['search', adapter.search !== undefined],
    ['hold', adapter.hold !== undefined],
    ['book', adapter.book !== undefined],
    ['cancel', adapter.cancel !== undefined && adapter.cancelQuote !== undefined],
    ['status', adapter.status !== undefined],
  ];
  return claims
    .filter(([capability, present]) => adapter.capabilities[capability] !== present)
    .map(([capability]) => capability);
}

export function isActivityAdapter(adapter: SupplierAdapter): adapter is ActivityAdapter {
  return (
    adapter.search !== undefined &&
    adapter.book !== undefined &&
    adapter.status !== undefined &&
    adapter.cancelQuote !== undefined &&
    adapter.cancel !== undefined
  );
}
