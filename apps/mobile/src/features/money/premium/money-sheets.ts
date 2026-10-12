/* eslint-disable lingui/no-unlocalized-strings -- route paths, not copy. */
/** The Money half's sheets in the premium UI: native form sheets over the wallet. */
import type { Href } from 'expo-router';

export const MONEY_SHEETS = {
  currency: '/wallet/money/currency',
  trip: '/wallet/money/trip',
} as const satisfies Record<string, Href>;
