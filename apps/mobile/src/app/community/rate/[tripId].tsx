import { useLocalSearchParams } from 'expo-router';

import { RatePremiumScreen } from '@/features/community/premium/rate-premium-screen';

/** Rate the trip (3o-3). */
export default function RateTripRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? (
    <RatePremiumScreen tripId={tripId} />
  ) : null;
}
