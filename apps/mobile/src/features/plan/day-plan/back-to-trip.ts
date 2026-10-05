/**
 * Where "← TRIP" on a day plan lands: the trip map under it, however many screens are stacked on
 * top (all days, another day, the day's open map), so the label is true whatever she walked
 * through. With no trip map underneath (the day was opened from the trip's hub, a push or day-of)
 * it goes back to where she came from.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route names, never copy. */
import { router, useNavigation } from 'expo-router';
import { useCallback } from 'react';

import { tripPlanRoutes } from '../hub/routes';

/** The routes of the trip's stack that show the trip map. */
const TRIP_MAP_ROUTES: readonly string[] = ['plan/index', 'plan/map'];

/**
 * How many screens to pop from the one at `index` to reach the nearest trip map under it; null
 * when there is none.
 */
export function popsToTripMap(routes: readonly string[], index: number): number | null {
  for (let at = index - 1; at >= 0; at -= 1) {
    if (TRIP_MAP_ROUTES.includes(routes[at] ?? '')) return index - at;
  }
  return null;
}

export function useBackToTrip(tripId: string): () => void {
  const navigation = useNavigation();
  return useCallback(() => {
    const state = navigation.getState();
    const pops =
      state === undefined
        ? null
        : popsToTripMap(
            state.routes.map((route) => route.name),
            state.index,
          );
    if (pops !== null) router.dismiss(pops);
    else if (router.canGoBack()) router.back();
    else router.replace(tripPlanRoutes.map(tripId));
  }, [navigation, tripId]);
}
