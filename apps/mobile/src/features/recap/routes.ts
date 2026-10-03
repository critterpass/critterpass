/**
 * The recap area's routes and the design ids the navigation registry knows them by: the recap page
 * (3m-1), opened from Home's post-trip card, the trip hub after the trip, the passport stamps and
 * the recap-ready push (`/recap/<tripId>`). Imported once by the root layout.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';

export const recapRoutes = {
  summary: (tripId: string): Href => ({ pathname: '/recap/[tripId]', params: { tripId } }),
};

registerScreens({
  '3m-1': (params) => recapRoutes.summary(params['tripId'] ?? ''),
});
