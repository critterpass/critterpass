import { useLocalSearchParams } from 'expo-router';

import { RatePremiumScreen } from '@/features/community/premium/rate-premium-screen';
import { RateTripScreen } from '@/features/community/rate/rate-screen';
import { premiumRoute } from '@/lib/premium-ui';

const RateTrip = premiumRoute({ premium: RatePremiumScreen, legacy: RateTripScreen });

/** Rate the trip (3o-3). */
export default function RateTripRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? <RateTrip tripId={tripId} /> : null;
}
