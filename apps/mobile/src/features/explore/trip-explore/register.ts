/**
 * Explore in a trip joins the screen registry as `7g-1` (`tripId`), swipe together as `7g-2` (its
 * screen sends matches to Ideas) and the destination guide as `7g-3`.
 */
import { registerScreens, type ScreenParams } from '@/lib/navigation/screen-registry';

import { exploreRoutes } from '../routes';

const destination = (params: ScreenParams) =>
  exploreRoutes.destination(params['placeId'] ?? '', {
    tripId: params['tripId'],
    crewId: params['crewId'],
  });

registerScreens({
  '7g-1': (params) => exploreRoutes.tripExplore(params['tripId'] ?? ''),
  '7g-2': (params) => exploreRoutes.swipe(params['tripId'] ?? '', params['sessionId'] ?? 'new'),
  '7g-3': destination,
});
