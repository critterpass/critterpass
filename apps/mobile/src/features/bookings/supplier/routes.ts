/**
 * Supplier and getting-around routes. Offers, the booking and cancel sheets and vendor messages are
 * modal; Getting around sits in the trip stack.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

export function offerRoute(params: {
  readonly tripId: string;
  readonly name: string;
  readonly date?: string;
  readonly destinationRef?: string;
  readonly currency?: string;
  readonly stableId?: string;
}): Href {
  return { pathname: '/supplier/offer', params: params };
}

export function bookRoute(params: {
  readonly tripId: string;
  readonly product: string;
  readonly title: string;
  readonly date: string;
  readonly currency: string;
  readonly stableId?: string;
}): Href {
  return { pathname: '/supplier/book', params: params };
}

export function cancelRoute(bookingId: string, title: string): Href {
  return { pathname: '/supplier/cancel', params: { bookingId, title } };
}

export function vendorMessagesRoute(tripId: string): Href {
  return { pathname: '/supplier/messages', params: { tripId } };
}

export function vendorDraftRoute(params: {
  readonly tripId: string;
  readonly vendorKind: 'provider' | 'poi';
  readonly vendorId: string;
  readonly vendorName: string;
  readonly intent: string;
  readonly text: string;
}): Href {
  return { pathname: '/supplier/draft', params: params };
}

export function gettingAroundRoute(
  params: { readonly tripId?: string; readonly to?: string; readonly from?: string } = {},
): Href {
  return { pathname: '/getting-around', params: params };
}
