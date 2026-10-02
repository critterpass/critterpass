import { useLocalSearchParams } from 'expo-router';

import { LocalFirstGate, PlaceScreen } from '@/features/explore';

/** A place's page (3d-3). */
export default function ExplorePlaceRoute() {
  const { placeId, destinationId, tripId } = useLocalSearchParams<{
    placeId: string;
    destinationId?: string;
    tripId?: string;
  }>();
  return (
    <LocalFirstGate>
      <PlaceScreen placeId={placeId} destinationId={destinationId} tripId={tripId} />
    </LocalFirstGate>
  );
}
