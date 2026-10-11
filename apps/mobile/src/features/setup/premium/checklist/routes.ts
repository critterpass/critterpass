/**
 * Setup's pages that only the premium look has: how everyone gets there (4.18) and the route (4.19).
 * The checklist and the member's part link to them.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import type { Href } from 'expo-router';

export const premiumSetupRoutes = {
  gettingThere: (tripId: string): Href => ({
    pathname: '/[tripId]/setup/getting-there',
    params: { tripId },
  }),
  route: (tripId: string): Href => ({ pathname: '/[tripId]/setup/route', params: { tripId } }),
};
