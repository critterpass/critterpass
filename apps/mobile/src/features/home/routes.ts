/**
 * Home's routes and the design screen ids the navigation registry knows them by, plus typed
 * helpers for the screens Home opens. Screens other areas build (the destination page, place
 * search, the trip hub, the recap, the profile) resolve through the registry, so Home never
 * hard-codes another area's path; while one is not registered its control stays inert.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { hrefFor, registerScreens } from '@/lib/navigation/screen-registry';

export const HOME_ROUTES = {
  home: '/',
  inbox: '/inbox',
  crewSheet: '/crew',
  joinCode: '/onboarding/invite/code',
} as const;

export const HOME_SCREENS: Readonly<Record<string, string>> = {
  '3b-1': HOME_ROUTES.home,
  '3b-2': HOME_ROUTES.home,
  '3b-6': HOME_ROUTES.home,
  '3b-4': HOME_ROUTES.inbox,
  '3b-5': HOME_ROUTES.inbox,
};

/** The Explore front page: undesigned, so the registry knows it by name. */
export const EXPLORE_SCREEN = 'explore-home';

let registered = false;

/** Joins Home's screens to the registry (once; the Home route imports this). */
export function registerHomeScreens(): void {
  if (registered) return;
  registered = true;
  registerScreens(HOME_SCREENS);
}

export function crewChatRoute(crewId: string): string {
  return `/crew/${crewId}/chat`;
}

/** Screens owned elsewhere, by design id. `undefined` until their area registers them. */
export const homeRoutes = {
  destination: (placeId: string): Href | undefined => hrefFor('7g-3', { placeId }),
  placeSearch: (): Href | undefined => hrefFor('3b-7'),
  tripHub: (tripId: string): Href | undefined => hrefFor('3k-1', { tripId }),
  /** The trip's day-of screen, on today. */
  tripDay: (tripId: string): Href | undefined => hrefFor('3k-2', { tripId }),
  recap: (tripId: string): Href | undefined => hrefFor('3m-1', { tripId }),
  profile: (): Href | undefined => hrefFor('3n-1'),
  pitch: (crewId: string): Href | undefined => hrefFor('3b-3', { crewId }),
};
