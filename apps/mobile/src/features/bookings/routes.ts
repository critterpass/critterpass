/**
 * The wallet's routes and the design screen ids the navigation registry knows them by. The stack,
 * the archive, a booking and adding one live in the Wallet tab (they keep the tab bar).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';

export const BOOKINGS_ROUTES = {
  wallet: '/wallet/bookings',
  add: '/wallet/bookings/add',
  archive: '/wallet/bookings/archive',
  insurance: '/wallet/bookings/insurance',
} as const;

export function bookingRoute(id: string): Href {
  return { pathname: '/wallet/bookings/[id]', params: { id } };
}

export function editBookingRoute(id: string): Href {
  return { pathname: '/wallet/bookings/edit/[id]', params: { id } };
}

export function boardingPassRoute(id: string): Href {
  return { pathname: '/wallet/bookings/pass/[id]', params: { id } };
}

export const BOOKINGS_SCREENS: Readonly<Record<string, string>> = {
  '3h-1': BOOKINGS_ROUTES.wallet,
  '3h-2': BOOKINGS_ROUTES.add,
};

let registered = false;

/** Joins the wallet's screens to the registry (once; the Wallet layout calls this). */
export function registerBookingsScreens(): void {
  if (registered) return;
  registered = true;
  registerScreens(BOOKINGS_SCREENS);
}
