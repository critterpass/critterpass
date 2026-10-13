/**
 * The wallet's routes and the design screen ids the navigation registry knows them by. The stack,
 * the archive, a booking and adding one live in the Wallet tab (they keep the tab bar).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';
import { Platform } from 'react-native';

import { registerScreens } from '@/lib/navigation/screen-registry';
import { premiumUiThisRun } from '@/lib/premium-ui';

export const BOOKINGS_ROUTES = {
  wallet: '/wallet/bookings',
  add: '/wallet/bookings/add',
  archive: '/wallet/bookings/archive',
  insurance: '/wallet/bookings/insurance',
  /** The premium wallet's sheets over the add page and the wallet. */
  paste: '/wallet/bookings/paste',
  linkCode: '/wallet/bookings/link-code',
  mailbox: '/wallet/bookings/mailbox',
} as const;

export function bookingRoute(id: string): Href {
  return { pathname: '/wallet/bookings/[id]', params: { id } };
}

export function editBookingRoute(id: string): Href {
  return { pathname: '/wallet/bookings/edit/[id]', params: { id } };
}

/**
 * Adding by hand, optionally prefilled from a confirmation that could not be read (`candidate`:
 * that confirmation's id, cleared from the list once the booking is saved).
 */
export function addByHandRoute(
  prefill: { kind?: string; title?: string; candidate?: string } = {},
): Href {
  return { pathname: '/wallet/bookings/edit/[id]', params: { id: 'new', ...prefill } };
}

/** The current UI's boarding pass: a rise over everything in the `(modal)` group. */
export function modalBoardingPassRoute(id: string): Href {
  return { pathname: '/bookings/pass/[id]', params: { id } };
}

/**
 * The boarding pass (7.11). The premium UI on iOS shows it from the wallet's own stack as a native
 * full-screen modal, which UIKit presents over the tab bar; Android draws a nested stack's modal
 * inside the tab, so there (and in the current UI) it rises over everything from `(modal)`.
 */
export function boardingPassRoute(id: string): Href {
  return premiumUiThisRun() && Platform.OS === 'ios'
    ? { pathname: '/wallet/bookings/pass/[id]', params: { id } }
    : modalBoardingPassRoute(id);
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
