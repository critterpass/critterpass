/**
 * The places map and list join the screen registry: `7c-1` and `7c-2` (the map, a place picked on
 * it) and `7c-3` (the list), and `3d-4`, the earlier Explore map, opens the new map while
 * `planning.redesign` is on (decided each time someone navigates), the earlier map while it is off.
 */
import type { Href } from 'expo-router';

import { planningRedesign } from '@/lib/navigation/planning-switch';
import { registerScreens, type ScreenParams } from '@/lib/navigation/screen-registry';

import { exploreRoutes } from '../routes';
import { parseFilter } from './places-model';
import { placesRoutes, type PlacesParams } from './routes';

function placesParams(params: ScreenParams): PlacesParams {
  return {
    filter: parseFilter(params['filter']),
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
  '3d-4': (params) =>
    planningRedesign()
      ? placesMap(params)
      : exploreRoutes.map(params['destinationId'] ?? '', {
          tripId: params['tripId'],
          placeId: params['placeId'],
        }),
});
