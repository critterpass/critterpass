/** The driver screens' routes under the trip: `/{tripId}/drivers/…`. */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import type { Href } from 'expo-router';

export type DriverScreen = 'index' | 'ask' | 'add' | 'check' | 'compare' | 'pick' | 'tours';

/** `days` are the legs picked on the hub (`YYYY-MM-DD`, comma-joined). */
export function driversRoute(
  tripId: string,
  screen: DriverScreen = 'index',
  params: Readonly<Record<string, string>> = {},
): Href {
  const pathname =
    screen === 'index' ? '/(trip)/[tripId]/drivers' : `/(trip)/[tripId]/drivers/${screen}`;
  return { pathname, params: { tripId, ...params } } as Href;
}

export const splitDays = (raw: string | undefined): string[] =>
  (raw ?? '').split(',').filter((day) => /^\d{4}-\d{2}-\d{2}$/u.test(day));
