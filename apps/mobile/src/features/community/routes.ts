/**
 * The community screens and the design ids the navigation registry knows them by: Crew plans
 * (3o-1, from the destination guide's CREW PLANS entry and the trip map), a shared plan (3o-2),
 * Rate the trip (3o-3, from the recap) and Share the plan (3o-4, from the plan's SHARE pill).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';

export const communityRoutes = {
  browse: (destination: string, tripId: string | null = null): Href => ({
    pathname: '/community/[destinationId]',
    params:
      tripId === null ? { destinationId: destination } : { destinationId: destination, tripId },
  }),
  plan: (sharedPlanId: string, tripId: string | null = null): Href => ({
    pathname: '/community/plan/[sharedPlanId]',
    params: tripId === null ? { sharedPlanId } : { sharedPlanId, tripId },
  }),
  rate: (tripId: string): Href => ({ pathname: '/community/rate/[tripId]', params: { tripId } }),
  publish: (tripId: string): Href => ({
    pathname: '/community/publish/[tripId]',
    params: { tripId },
  }),
};

function param(params: Readonly<Record<string, string>>, ...keys: string[]): string {
  for (const key of keys) {
    const value = params[key];
    if (value !== undefined && value !== '') return value;
  }
  return '';
}

registerScreens({
  '3o-1': (params) =>
    communityRoutes.browse(
      param(params, 'placeId', 'destinationId', 'destination'),
      param(params, 'tripId') || null,
    ),
  '3o-2': (params) =>
    communityRoutes.plan(param(params, 'sharedPlanId', 'id'), param(params, 'tripId') || null),
  '3o-3': (params) => communityRoutes.rate(param(params, 'tripId')),
  '3o-4': (params) => communityRoutes.publish(param(params, 'tripId')),
});
