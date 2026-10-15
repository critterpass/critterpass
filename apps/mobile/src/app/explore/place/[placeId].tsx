import { useLocalSearchParams } from 'expo-router';

import { PremiumPlaceScreen } from '@/features/explore/premium/place/place-screen';

/** A place's page (7e-1; 4.36). */
export default function ExplorePlaceRoute() {
  const { placeId, destinationId, tripId } = useLocalSearchParams<{
    placeId: string;
    destinationId?: string;
    tripId?: string;
  }>();
  return <PremiumPlaceScreen placeId={placeId} destinationId={destinationId} tripId={tripId} />;
}
