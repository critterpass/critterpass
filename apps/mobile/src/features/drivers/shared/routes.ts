/**
 * Every driver screen's route under the trip (`/{tripId}/drivers/…`), in one typed map: finding
 * and comparing, the directory, the crew's own drivers, the rate card and the invite.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import type { Href } from 'expo-router';

const SCREENS = {
  index: '/[tripId]/drivers',
  ask: '/[tripId]/drivers/ask',
  add: '/[tripId]/drivers/add',
  check: '/[tripId]/drivers/check',
  compare: '/[tripId]/drivers/compare',
  pick: '/[tripId]/drivers/pick',
  tours: '/[tripId]/drivers/tours',
} as const;

export type DriverScreen = keyof typeof SCREENS;

/** `days` are the legs picked on the hub (`YYYY-MM-DD`, comma-joined). */
export function driversRoute(
  tripId: string,
  screen: DriverScreen = 'index',
  params: Readonly<Record<string, string>> = {},
): Href {
  return { pathname: SCREENS[screen], params: { tripId, ...params } };
}

export const driverRoutes = {
  directory: (tripId: string, area?: string): Href => ({
    pathname: '/[tripId]/drivers/directory',
    params: area === undefined ? { tripId } : { tripId, area },
  }),
  detail: (tripId: string, listingId: string): Href => ({
    pathname: '/[tripId]/drivers/directory/[listingId]',
    params: { tripId, listingId },
  }),
  ours: (tripId: string): Href => ({ pathname: '/[tripId]/drivers/ours', params: { tripId } }),
  rate: (tripId: string, providerId: string): Href => ({
    pathname: '/[tripId]/drivers/ours/rate/[providerId]',
    params: { tripId, providerId },
  }),
  invite: (tripId: string, providerId: string): Href => ({
    pathname: '/[tripId]/drivers/ours/invite/[providerId]',
    params: { tripId, providerId },
  }),
};

export const splitDays = (raw: string | undefined): string[] =>
  (raw ?? '').split(',').filter((day) => /^\d{4}-\d{2}-\d{2}$/u.test(day));
