import { useLocalSearchParams } from 'expo-router';

import { RateDriverPremium } from '@/features/drivers/premium/RateDriverPremium';

/** Rate your driver (6g-1, 6.24): `/{tripId}/drivers/ours/rate/{providerId}`. */
export default function RateDriverRoute() {
  const { tripId, providerId } = useLocalSearchParams<{ tripId: string; providerId: string }>();
  const props = { tripId: tripId ?? '', providerId: providerId ?? '' };
  return <RateDriverPremium {...props} />;
}
