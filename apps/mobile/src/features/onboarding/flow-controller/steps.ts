/**
 * Where each onboarding step lives, and the design screen ids the navigation registry knows them
 * by (3a-1 splash … 3a-9 permissions).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and analytics step names, never copy. */
import { resumeStep, type PassDraft, type PassDraftStep } from '@cp/domain';

export const ONBOARDING_ROUTES = {
  splash: '/onboarding',
  name: '/onboarding/name',
  photo: '/onboarding/photo',
  taste: '/onboarding/taste',
  home: '/onboarding/home',
  issued: '/onboarding/issued',
  save: '/onboarding/save',
  phone: '/onboarding/phone',
  permissions: '/onboarding/permissions',
} as const;

export type OnboardingRoute = (typeof ONBOARDING_ROUTES)[keyof typeof ONBOARDING_ROUTES];

/** Design screen id → route, for the navigation registry and the session gate. */
export const ONBOARDING_SCREENS: Readonly<Record<string, OnboardingRoute>> = {
  '3a-1': ONBOARDING_ROUTES.splash,
  '3a-2': ONBOARDING_ROUTES.name,
  '3a-3': ONBOARDING_ROUTES.photo,
  '3a-4': ONBOARDING_ROUTES.taste,
  '3a-5': ONBOARDING_ROUTES.home,
  '3a-6': ONBOARDING_ROUTES.issued,
  '3a-7': ONBOARDING_ROUTES.save,
  '3a-8': ONBOARDING_ROUTES.phone,
  '3a-9': ONBOARDING_ROUTES.permissions,
};

const STEP_ROUTES: Readonly<Record<PassDraftStep, OnboardingRoute>> = {
  name: ONBOARDING_ROUTES.name,
  photo: ONBOARDING_ROUTES.photo,
  taste: ONBOARDING_ROUTES.taste,
  home: ONBOARDING_ROUTES.home,
  issued: ONBOARDING_ROUTES.issued,
  // Saved (or "Not now"): the last step is the permissions page.
  saved: ONBOARDING_ROUTES.permissions,
};

export function routeForStep(step: PassDraftStep): OnboardingRoute {
  return STEP_ROUTES[step];
}

/** Where a relaunch lands: the splash for a new install, else the step the draft stopped at. */
export function resumeRoute(draft: PassDraft | null): OnboardingRoute {
  return draft === null ? ONBOARDING_ROUTES.splash : routeForStep(resumeStep(draft));
}

/** 1-based "PAGE n OF 4" for the four data pages. */
export const PAGE_OF: Readonly<Partial<Record<PassDraftStep, number>>> = {
  name: 1,
  photo: 2,
  taste: 3,
  home: 4,
};
export const PAGE_COUNT = 4;
