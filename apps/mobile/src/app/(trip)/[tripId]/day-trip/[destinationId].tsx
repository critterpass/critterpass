import { useLocalSearchParams } from 'expo-router';

import { AreaScreen } from '@/features/explore/day-trips/area-screen';

/** A day-trip area's page inside a trip: `/{tripId}/day-trip/{destinationId}`. */
export default function DayTripAreaRoute() {
  const { tripId, destinationId } = useLocalSearchParams<{
    tripId: string;
    destinationId: string;
  }>();
  return <AreaScreen tripId={tripId ?? ''} destinationId={destinationId ?? ''} />;
}
