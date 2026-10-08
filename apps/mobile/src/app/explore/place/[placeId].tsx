import { useLocalSearchParams } from 'expo-router';

import { PlaceScreen } from '@/features/explore';

/** A place's page (7e-1). */
export default function ExplorePlaceRoute() {
  const { placeId, destinationId, tripId } = useLocalSearchParams<{
    placeId: string;
    destinationId?: string;
    tripId?: string;
  }>();
  return <PlaceScreen placeId={placeId} destinationId={destinationId} tripId={tripId} />;
}
