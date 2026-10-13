/**
 * The trip day's routes and the design ids the navigation registry knows them by: the trip hub
 * (3k-1) and the day-of screen (3k-2) live in the TRIPS tab so the tab bar stays; the offline
 * card (3k-4) and the offline storage page open over it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';
import { premiumUiThisRun } from '@/lib/premium-ui';

/** The TRIPS tab's root (the trip switcher). */
export const TRIPS_TAB: Href = '/(tabs)/trips';

/** `today` resolves to the trip's own date when the screen opens. */
export const TODAY = 'today';

export function tripHubRoute(tripId: string): Href {
  return { pathname: '/(tabs)/trips/[tripId]', params: { tripId } };
}

/**
 * A trip's day-of page. The premium UI pushes it on the hub's own stack over the tabs, so it keeps
 * the hub under it and the glass back; the current UI keeps it in the TRIPS tab.
 */
export function tripDayRoute(tripId: string, date: string | null): Href {
  const params = { tripId, date: date ?? TODAY };
  return premiumUiThisRun()
    ? { pathname: '/(trip)/hub/[tripId]/day/[date]', params }
    : { pathname: '/(tabs)/trips/[tripId]/day/[date]', params };
}

export function tripOfflineRoute(tripId: string): Href {
  return { pathname: '/(trip)/hub/[tripId]/offline', params: { tripId } };
}

export function offlineStorageRoute(): Href {
  return '/(trip)/hub/offline-storage';
}

export const TRIP_DAY_SCREENS = {
  '3k-1': (params: Readonly<Record<string, string>>) => tripHubRoute(params['tripId'] ?? ''),
  '3k-2': (params: Readonly<Record<string, string>>) =>
    tripDayRoute(params['tripId'] ?? '', params['date'] ?? null),
  '3k-4': (params: Readonly<Record<string, string>>) => tripOfflineRoute(params['tripId'] ?? ''),
} as const;

let registered = false;

export function registerTripDayScreens(): void {
  if (registered) return;
  registered = true;
  registerScreens(TRIP_DAY_SCREENS);
}
