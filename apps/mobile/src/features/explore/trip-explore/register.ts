/**
 * Explore in a trip joins the screen registry as `7g-1` (`tripId`), swipe together as `7g-2` (the
 * same route as 3d-2, whose screen sends matches to Ideas) and the destination guide as `7g-3` (the
 * 3d-1 route without a trip). While `planning.redesign` is on, `3d-1` with a trip (the trip hub's
 * Explore entry) opens 7g-1 instead of the guide page; without a trip, or with the switch off, it
 * opens the guide page as before.
 */
import { planningRedesign } from '@/lib/navigation/planning-switch';
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
  '3d-1': (params) => {
    const tripId = params['tripId'];
    return planningRedesign() && tripId !== undefined && tripId !== ''
      ? exploreRoutes.tripExplore(tripId)
      : destination(params);
  },
});
