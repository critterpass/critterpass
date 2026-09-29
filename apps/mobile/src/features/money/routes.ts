/**
 * Money's routes and the design screen ids the navigation registry knows them by. Balances and
 * Budget live in the Wallet tab (they keep the tab bar); entering an expense, scanning, settling
 * up, the history and the details push over the tabs.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { hrefFor, registerScreens } from '@/lib/navigation/screen-registry';

export const MONEY_ROUTES = {
  balances: '/wallet/money',
  budget: '/wallet/money/budget',
  add: '/money/add',
  scan: '/money/scan',
  settle: '/money/settle',
  history: '/money/history',
  payoutMethods: '/money/payout-methods',
} as const;

export function expenseRoute(id: string): Href {
  return { pathname: '/money/expense/[id]', params: { id } };
}

export function editExpenseRoute(id: string): Href {
  return { pathname: '/money/add', params: { edit: id } };
}

export function paymentRoute(id: string): Href {
  return { pathname: '/money/payment/[id]', params: { id } };
}

export const MONEY_SCREENS: Readonly<Record<string, string>> = {
  '3i-1': MONEY_ROUTES.balances,
  '3i-2': MONEY_ROUTES.add,
  '3i-3': MONEY_ROUTES.scan,
  '3i-4': MONEY_ROUTES.scan,
  '3i-5': MONEY_ROUTES.settle,
  '3i-6': MONEY_ROUTES.budget,
};

let registered = false;

/** Joins Money's screens to the registry (once; the Wallet layout imports this). */
export function registerMoneyScreens(): void {
  if (registered) return;
  registered = true;
  registerScreens(MONEY_SCREENS);
}

/** The bookings half of the Wallet, once its area registers it. */
export function bookingsHref(): Href | undefined {
  return hrefFor('3h-1');
}
