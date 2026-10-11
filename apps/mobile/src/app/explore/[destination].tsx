import { useLocalSearchParams } from 'expo-router';

import { DestinationScreen } from '@/features/explore';
import { PremiumDestinationView } from '@/features/explore/premium/destination/destination-page';
import { usePremiumUi } from '@/lib/premium-ui';

/** A destination's guide page (7g-3; the guest guide's variant is 3b-8; 4.04 in the premium look). */
export default function ExploreDestinationRoute() {
  const { destination, tripId, crewId } = useLocalSearchParams<{
    destination: string;
    tripId?: string;
    crewId?: string;
  }>();
  const premium = usePremiumUi();
  return (
    <DestinationScreen
      destination={destination}
      tripId={tripId}
      crewId={crewId}
      {...(premium ? { View: PremiumDestinationView } : {})}
    />
  );
}
