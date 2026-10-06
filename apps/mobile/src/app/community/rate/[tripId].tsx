import { useLocalSearchParams } from 'expo-router';

import { RateTripScreen } from '@/features/community/rate/rate-screen';

/** Rate the trip (3o-3). */
export default function RateTripRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? (
    <RateTripScreen tripId={tripId} />
  ) : null;
}
