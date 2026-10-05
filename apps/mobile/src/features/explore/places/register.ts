/**
 * The places map and list join the screen registry: `7c-1` and `7c-2` (the map, a place picked on
 * it) and `7c-3` (the list).
 */
import type { Href } from 'expo-router';

import { registerScreens, type ScreenParams } from '@/lib/navigation/screen-registry';

import { exploreRoutes } from '../routes';
import { categoryGroupOf, parseFilter } from './places-model';
import { placesRoutes, type PlacesParams } from './routes';

/** The list's filter: its own key, else the group a raw category (`temple_shrine`) belongs to. */
export function filterParam(params: ScreenParams): string | undefined {
  const category = params['category'];
  return (
    params['filter'] ??
    (category === undefined ? undefined : (categoryGroupOf(category) ?? undefined))
  );
}

function placesParams(params: ScreenParams): PlacesParams {
  return {
    filter: parseFilter(filterParam(params)),
    placeId: params['placeId'],
    results: params['results'],
    chips: params['chips'],
  };
}

function placesMap(params: ScreenParams): Href {
  const tripId = params['tripId'];
  if (tripId !== undefined && tripId !== '') return placesRoutes.map(tripId, placesParams(params));
  return exploreRoutes.map(params['destinationId'] ?? '', { placeId: params['placeId'] });
}

registerScreens({
  '7c-1': placesMap,
  '7c-2': placesMap,
  '7c-3': (params) => {
    const tripId = params['tripId'] ?? '';
    return tripId === ''
      ? exploreRoutes.map(params['destinationId'] ?? '')
      : placesRoutes.list(tripId, placesParams(params));
  },
});
