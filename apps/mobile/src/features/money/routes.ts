/**
 * Money's routes and the design screen ids the navigation registry knows them by. Balances and
 * Budget live in the Wallet tab (they keep the tab bar); entering an expense, scanning, settling
 * up, the history and the details push over the tabs.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens, type ScreenRoute } from '@/lib/navigation/screen-registry';

export const MONEY_ROUTES = {
  balances: '/wallet/money',
  budget: '/wallet/money/budget',
  add: '/money/add',
  scan: '/money/scan',
  settle: '/money/settle',
  history: '/money/history',
  payoutMethods: '/money/payout-methods',
} as const;

/**
 * The `trip` query a money route carries when it is opened for one trip (a chat card, the guide's
 * camera, a link): the screen shows that trip whatever Balances last showed. Without it the screen
 * follows Balances.
 */
function forTrip(tripId: string | null | undefined): { trip?: string } {
  return tripId === null || tripId === undefined || tripId === '' ? {} : { trip: tripId };
}

/**
 * The trip a money route was opened for, or null when it follows Balances. Money's own links write
 * `trip`; a caller that pushes the path with the registry's `tripId` param is read the same way.
 */
export function tripParam(
  trip: string | string[] | undefined,
  tripId?: string | string[],
): string | null {
  for (const value of [trip, tripId]) {
    if (typeof value === 'string' && value !== '') return value;
  }
  return null;
}

export function expenseRoute(id: string, tripId?: string | null): Href {
  return { pathname: '/money/expense/[id]', params: { id, ...forTrip(tripId) } };
}

export function editExpenseRoute(id: string, tripId?: string | null): Href {
  return { pathname: '/money/add', params: { edit: id, ...forTrip(tripId) } };
}

export function paymentRoute(id: string, tripId?: string | null): Href {
  return { pathname: '/money/payment/[id]', params: { id, ...forTrip(tripId) } };
}

/** A pushed money screen for the trip the caller names (`tripId`), else the one Balances shows. */
function tripScreen(pathname: '/money/add' | '/money/scan' | '/money/settle'): ScreenRoute {
  return (params) => {
    const trip = forTrip(params['tripId']);
    return trip.trip === undefined ? pathname : { pathname, params: trip };
  };
}

export const MONEY_SCREENS: Readonly<Record<string, ScreenRoute>> = {
  '3i-1': MONEY_ROUTES.balances,
  '3i-2': tripScreen(MONEY_ROUTES.add),
  '3i-3': tripScreen(MONEY_ROUTES.scan),
  '3i-4': tripScreen(MONEY_ROUTES.scan),
  '3i-5': tripScreen(MONEY_ROUTES.settle),
  '3i-6': MONEY_ROUTES.budget,
};

let registered = false;

/** Joins Money's screens to the registry (once; the Wallet layout imports this). */
export function registerMoneyScreens(): void {
  if (registered) return;
  registered = true;
  registerScreens(MONEY_SCREENS);
}
