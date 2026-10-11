/** Where the day trips list (4.49) lives inside a trip. */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import type { Href } from 'expo-router';

export function dayTripsRoute(tripId: string): Href {
  return { pathname: '/[tripId]/day-trips', params: { tripId } };
}
