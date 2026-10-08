/** The invited fast path's routes (3a-10 … 3a-13) and the design screen ids they carry. */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { isOnboardingComplete } from '@/lib/links/pending';

export const INVITED_ROUTES = {
  ticket: '/onboarding/invite/ticket',
  code: '/onboarding/invite/code',
  pass: '/onboarding/invite/pass',
  manifest: '/onboarding/invite/manifest',
} as const;

/** Where the invited path hands off: Home, the regular pass flow, phone save and a trip's plan. */
export const HANDOFF_ROUTES = {
  home: '/',
  passFlow: '/onboarding',
  phone: '/onboarding/phone',
} as const;

/** Leaving an invite without taking the seat: Home for someone with a pass, else the pass flow. */
export function withoutSeatRoute(): string {
  return isOnboardingComplete() ? HANDOFF_ROUTES.home : HANDOFF_ROUTES.passFlow;
}

export function tripPlanRoute(tripId: string): string {
  return `/${tripId}/plan`;
}

export const INVITED_SCREENS: Readonly<Record<string, string>> = {
  '3a-10': INVITED_ROUTES.ticket,
  '3a-11': INVITED_ROUTES.code,
  '3a-12': INVITED_ROUTES.pass,
  '3a-13': INVITED_ROUTES.manifest,
};
