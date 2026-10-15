import { useLocalSearchParams } from 'expo-router';

import { CancelTripScreen } from '@/features/plan/premium/settings/cancel-trip-screen';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId;
}

/** Cancel the trip, its consequences and the hold (4.55). */
export default function Route() {
  return <CancelTripScreen tripId={useTripId()} />;
}
