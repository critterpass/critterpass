/**
 * The profile area's routes and the design ids the navigation registry knows them by: the profile
 * (3n-1, opened from Home's "HEY {NAME} ›") and Settings (3n-2, and 3n-6 further down the same
 * screen). Imported once by the root layout, so Home's header finds the profile from first render.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';

export const YOU_ROUTES = {
  profile: '/you',
  settings: '/you/settings',
  pings: '/you/pings',
  signOut: '/you/sign-out',
  language: '/you/language',
  sound: '/you/sound',
  appIcon: '/you/app-icon',
  stamps: '/you/stamps',
  edit: '/you/edit',
  avatar: '/you/avatar',
  pastTrip: '/you/past-trip',
  deleteAccount: '/you/delete',
  /** Settings > Offline lives with the trip screens. */
  offlineStorage: '/(trip)/hub/offline-storage',
} as const satisfies Readonly<Record<string, Href>>;

export const YOU_SCREENS: Readonly<Record<string, Href>> = {
  '3n-1': YOU_ROUTES.profile,
  '3n-2': YOU_ROUTES.settings,
  '3n-3': YOU_ROUTES.edit,
  '3n-4': YOU_ROUTES.avatar,
  '3n-5': YOU_ROUTES.appIcon,
  '3n-6': YOU_ROUTES.settings,
  '5b-4': YOU_ROUTES.pings,
  '3n-7': YOU_ROUTES.sound,
  '3n-8': YOU_ROUTES.language,
  '3n-9': YOU_ROUTES.deleteAccount,
  '3n-10': YOU_ROUTES.deleteAccount,
};

registerScreens(YOU_SCREENS);
