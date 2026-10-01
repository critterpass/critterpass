/**
 * Explore's routes and the design screen ids the navigation registry knows them by, so Home, the
 * trip hub and links open them without hard-coding a path. Imported once by the root layout.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { hrefFor, registerScreens } from '@/lib/navigation/screen-registry';

export interface PlaceParams {
  readonly destinationId?: string | undefined;
  readonly tripId?: string | undefined;
}

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
  /** Explore's front page: every destination, search and the way to saved places. */
  home: (): Href => '/explore',
  saved: (): Href => '/explore/saved',
  /** A destination's guide page, by id or slug. */
  destination: (destination: string, params: DestinationParams = {}): Href => ({
    pathname: '/explore/[destination]',
    params: { destination, ...defined({ tripId: params.tripId, crewId: params.crewId }) },
  }),
  /** A place's page; `destinationId` lets its places sync before the place itself is known. */
  place: (placeId: string, params: PlaceParams = {}): Href => ({
    pathname: '/explore/place/[placeId]',
    params: {
      placeId,
      ...defined({ destinationId: params.destinationId, tripId: params.tripId }),
    },
  }),
  /** Screens other areas own, by design id: undefined until that area registers them. */
  pitch: (crewId: string, placeId: string): Href | undefined =>
    hrefFor('3b-3', { crewId, placeId }),
  tripSetup: (tripId: string): Href | undefined => hrefFor('3c-3', { tripId }),
  crewPlans: (placeId: string): Href | undefined => hrefFor('3o-1', { placeId }),
  profile: (): Href | undefined => hrefFor('3n-1'),
  /** The search for any place (the vote area's sheet). */
  search: (): Href | undefined => hrefFor('3b-7'),
  plan: (tripId: string): Href | undefined => hrefFor('3e-1', { tripId }),
  /**
   * Partner offers for an activity, in the partners' own words (the suppliers area's screen). The
   * offers screen works inside a trip, so there is none to open without one.
   */
  offers: (params: {
    readonly tripId: string | null;
    readonly name: string;
    readonly date: string;
  }): Href | undefined =>
    params.tripId === null
      ? undefined
      : hrefFor('6f-1', { tripId: params.tripId, name: params.name, date: params.date }),
  /** The guide chat, inside the trip when there is one. */
  guideChat: (tripId: string | null): Href | undefined =>
    hrefFor('3j-1', tripId === null ? {} : { tripId }),
};

registerScreens({
  // Explore's front page and the saved hub have no design render: other areas open them by name.
  'explore-home': () => exploreRoutes.home(),
  'explore-saved': () => exploreRoutes.saved(),
  '3d-1': (params) =>
    exploreRoutes.destination(params['placeId'] ?? '', {
      tripId: params['tripId'],
      crewId: params['crewId'],
    }),
  '3d-3': (params) =>
    exploreRoutes.place(params['placeId'] ?? '', {
      destinationId: params['destinationId'],
      tripId: params['tripId'],
    }),
});
