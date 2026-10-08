import { useLocalSearchParams } from 'expo-router';

import { TripExploreScreen } from '@/features/explore/trip-explore';

/** Explore in a trip (7g-1): `/{tripId}/explore`. */
export default function TripExploreRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <TripExploreScreen tripId={tripId ?? ''} />;
}
