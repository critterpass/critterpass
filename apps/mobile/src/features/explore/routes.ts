/**
 * Explore's routes and the design screen ids the navigation registry knows them by, so Home, the
 * trip hub and links open them without hard-coding a path. Imported once by the root layout.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { hrefFor, registerScreens } from '@/lib/navigation/screen-registry';

export interface DestinationParams {
  readonly tripId?: string | undefined;
  readonly crewId?: string | undefined;
}

function defined(params: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export const exploreRoutes = {
  /** A destination's guide page, by id or slug. */
  destination: (destination: string, params: DestinationParams = {}): Href => ({
    pathname: '/explore/[destination]',
    params: { destination, ...defined({ tripId: params.tripId, crewId: params.crewId }) },
  }),
  /** Screens other areas own, by design id: undefined until that area registers them. */
  pitch: (crewId: string, placeId: string): Href | undefined =>
    hrefFor('3b-3', { crewId, placeId }),
  tripSetup: (tripId: string): Href | undefined => hrefFor('3c-3', { tripId }),
  crewPlans: (placeId: string): Href | undefined => hrefFor('3o-1', { placeId }),
  profile: (): Href | undefined => hrefFor('3n-1'),
};

registerScreens({
  '3d-1': (params) =>
    exploreRoutes.destination(params['placeId'] ?? '', {
      tripId: params['tripId'],
      crewId: params['crewId'],
    }),
});
