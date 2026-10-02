import { useLocalSearchParams } from 'expo-router';

import { ExploreMapScreen, LocalFirstGate } from '@/features/explore';

/** A destination's map with its places, filters and cards (3d-4), and the list view of the same. */
export default function ExploreMapRoute() {
  const { destination, tripId, placeId } = useLocalSearchParams<{
    destination?: string;
    tripId?: string;
    placeId?: string;
  }>();
  return (
    <LocalFirstGate>
      <ExploreMapScreen destination={destination ?? ''} tripId={tripId} placeId={placeId} />
    </LocalFirstGate>
  );
}
