/**
 * The monetization routes and the design ids the navigation registry knows them by: the paywall
 * (4e-1), what is in each plan (4e-2), the welcome (4e-3), the boost sheet (4b-3) and its stamp
 * (4b-5), and plan management (4d-1, 4d-2, 4d-3).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens, type ScreenRoute } from '@/lib/navigation/screen-registry';

export const MONETIZE_ROUTES = {
  paywall: '/(modal)/paywall',
  compare: '/(modal)/paywall/compare',
  welcome: '/(modal)/paywall/welcome',
  plan: '/you/plan',
  cancel: '/you/plan/cancel',
  billingIssue: '/you/plan/billing-issue',
} as const satisfies Readonly<Record<string, Href>>;

export function boostHref(tripId: string): Href {
  return { pathname: '/(modal)/boost/[tripId]', params: { tripId } };
}

export function stampedHref(tripId: string, split: boolean): Href {
  return { pathname: '/(modal)/boost/stamped', params: { tripId, split: split ? '1' : '0' } };
}

export const MONETIZE_SCREENS: Readonly<Record<string, ScreenRoute>> = {
  '4e-1': MONETIZE_ROUTES.paywall,
  '4e-2': MONETIZE_ROUTES.compare,
  '4e-3': MONETIZE_ROUTES.welcome,
  '4b-3': (params) => boostHref(params.tripId ?? ''),
  '4b-5': (params) => stampedHref(params.tripId ?? '', params.split === '1'),
  '4d-1': MONETIZE_ROUTES.plan,
  '4d-2': MONETIZE_ROUTES.cancel,
  '4d-3': MONETIZE_ROUTES.billingIssue,
};

registerScreens(MONETIZE_SCREENS);
