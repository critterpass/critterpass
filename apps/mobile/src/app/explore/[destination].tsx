import { useLocalSearchParams } from 'expo-router';

import { DestinationScreen, LocalFirstGate } from '@/features/explore';

/** A destination's guide page (3d-1; the guest guide's variant is 3b-8). */
export default function ExploreDestinationRoute() {
  const { destination, tripId, crewId } = useLocalSearchParams<{
    destination: string;
    tripId?: string;
    crewId?: string;
  }>();
  return (
    <LocalFirstGate>
      <DestinationScreen destination={destination} tripId={tripId} crewId={crewId} />
    </LocalFirstGate>
  );
}
