import { useLocalSearchParams } from 'expo-router';

import { DestinationScreen } from '@/features/explore';
import { PremiumDestinationView } from '@/features/explore/premium/destination/destination-page';

/** A destination's guide page (7g-3; the guest guide's variant is 3b-8; 4.04). */
export default function ExploreDestinationRoute() {
  const { destination, tripId, crewId } = useLocalSearchParams<{
    destination: string;
    tripId?: string;
    crewId?: string;
  }>();
  return (
    <DestinationScreen
      destination={destination}
      tripId={tripId}
      crewId={crewId}
      View={PremiumDestinationView}
    />
  );
}
