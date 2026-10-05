/**
 * Where Explore in a trip leads, by design screen id: screens other areas own, undefined until they
 * register. Filling a gap opens the gap filler (7h-2), else the gap's day; all places opens the
 * places list (7c-3), else the destination's map.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design screen ids and params, never copy. */
import type { Href } from 'expo-router';

import { hrefFor } from '@/lib/navigation/screen-registry';

import { exploreRoutes } from '../routes';

export const tripExploreLinks = {
  hub: (tripId: string): Href | undefined => hrefFor('3k-1', { tripId }),
  ideas: (tripId: string): Href | undefined => hrefFor('7f-2', { tripId }),
  search: (tripId: string): Href | undefined => hrefFor('7d-1', { tripId, scope: 'explore' }),
  fillGap: (
    tripId: string,
    gap: {
      readonly dayId: string;
      readonly dayNo: number;
      readonly from: string;
      readonly to: string;
    },
  ): Href | undefined =>
    hrefFor('7h-2', { tripId, dayId: gap.dayId, from: gap.from, to: gap.to }) ??
    hrefFor('3e-2', { tripId, day: String(gap.dayNo) }),
  /** Search for a day: where one person fills a free window (the gap filler plans for a crew). */
  daySearch: (tripId: string, dayId: string): Href | undefined =>
    hrefFor('7d-1', { tripId, scope: 'day', dayId }),
  /** The places list on one kind of place (a category group's key). */
  kind: (tripId: string, group: string): Href | undefined =>
    hrefFor('7c-3', { tripId, filter: group }),
  allPlaces: (tripId: string, destinationId: string | null): Href | undefined =>
    hrefFor('7c-3', { tripId }) ??
    (destinationId === null ? undefined : exploreRoutes.map(destinationId, { tripId })),
};
