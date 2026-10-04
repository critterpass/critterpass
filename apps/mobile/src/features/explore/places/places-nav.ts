/**
 * Where the places map and list lead: a place (7e-1, else the earlier place page), Add to plan
 * (7f-1, shown only once it is on this phone), the search (7d-1 scoped to the map, else the
 * earlier search) and a split crew (7e-3).
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids and route params, never copy. */
import type { Href } from 'expo-router';

import { hrefFor, useScreenHref } from '@/lib/navigation/screen-registry';

import { exploreRoutes } from '../routes';

export function placeHref(
  poiId: string,
  tripId: string | null,
  destinationId: string | null,
): Href {
  const params = tripId === null ? { placeId: poiId } : { placeId: poiId, tripId };
  return (
    hrefFor('7e-1', params) ??
    exploreRoutes.place(poiId, {
      destinationId: destinationId ?? undefined,
      tripId: tripId ?? undefined,
    })
  );
}

export function addToPlanHref(tripId: string, poiId: string): Href | undefined {
  return hrefFor('7f-1', { tripId, placeId: poiId });
}

/** Whether Add to plan is on this phone (re-renders when it registers). */
export function useCanAddToPlan(tripId: string | null): boolean {
  return (
    useScreenHref('7f-1', { tripId: tripId ?? '', placeId: '' }) !== undefined && tripId !== null
  );
}

export function searchHref(tripId: string | null, scope: 'map' | 'explore'): Href | undefined {
  if (tripId === null) return exploreRoutes.search();
  return hrefFor('7d-1', { tripId, scope }) ?? exploreRoutes.search();
}

export function splitHref(tripId: string, poiId: string): Href | undefined {
  return hrefFor('7e-3', { tripId, placeId: poiId });
}

/** The trip's plan hub, for the list's IN THE PLAN row. */
export function planHref(tripId: string): Href | undefined {
  return hrefFor('7a-1', { tripId }) ?? hrefFor('3e-1', { tripId });
}
