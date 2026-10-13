import { Redirect, useLocalSearchParams } from 'expo-router';

import { TripExploreScreen } from '@/features/explore/trip-explore';
import { searchRoutes } from '@/features/explore';
import { premiumRoute } from '@/lib/premium-ui';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId ?? '';
}

/** Explore inside a trip (`/{tripId}/explore`): the destination, its gaps, picks and the swipe. */
function CurrentTripExploreRoute() {
  return <TripExploreScreen tripId={useTripId()} />;
}

/**
 * The premium look has no separate explore page: Find (4.30) carries its tiles (swipe together,
 * day trips, crews' plans) and the kinds to browse, so the trip's explore opens Find.
 */
function PremiumTripExploreRoute() {
  return <Redirect href={searchRoutes.search(useTripId(), { scope: 'explore' })} />;
}

export default premiumRoute({ premium: PremiumTripExploreRoute, legacy: CurrentTripExploreRoute });
