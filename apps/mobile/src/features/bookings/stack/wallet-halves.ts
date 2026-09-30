/**
 * The Wallet tab's two halves, BOOKINGS and MONEY, are both its root: switching swaps one for the
 * other in place. Neither half animates in or answers the back swipe, so the switch reads as a
 * segmented control rather than a push, while `/wallet/bookings` and `/wallet/money` stay links.
 */
/* eslint-disable lingui/no-unlocalized-strings -- routes and option values, never copy. */
import { router, type Href } from 'expo-router';
import type { StackNavigationOptions } from 'expo-router/js-stack';

import { BOOKINGS_ROUTES } from '../routes';

export type WalletHalf = 'bookings' | 'money';

const MONEY_HOME: Href = '/wallet/money';

/** The Wallet stack's options for both halves (`money/index` and the `bookings` group). */
export const WALLET_HALF_OPTIONS: StackNavigationOptions = {
  animation: 'none',
  gestureEnabled: false,
};

/** Shows `half`: back to it when it is already under the current one, else in place of it. */
export function switchWalletHalf(half: WalletHalf): void {
  router.dismissTo(half === 'bookings' ? BOOKINGS_ROUTES.wallet : MONEY_HOME);
}
