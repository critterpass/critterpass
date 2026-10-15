import { Redirect, useLocalSearchParams } from 'expo-router';

import { searchRoutes } from '@/features/explore';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId ?? '';
}

/**
 * The trip has no separate explore page: Find (4.30) carries its tiles (swipe together,
 * day trips, crews' plans) and the kinds to browse, so the trip's explore opens Find.
 */
export default function TripExploreRoute() {
  return <Redirect href={searchRoutes.search(useTripId(), { scope: 'explore' })} />;
}
