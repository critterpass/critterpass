import { useLocalSearchParams } from 'expo-router';

import { RateDriverScreen } from '@/features/drivers/rating/RateDriverScreen';

/** Rate your driver (6g-1): `/{tripId}/drivers/ours/rate/{providerId}`. */
export default function RateDriverRoute() {
  const { tripId, providerId } = useLocalSearchParams<{ tripId: string; providerId: string }>();
  return <RateDriverScreen tripId={tripId ?? ''} providerId={providerId ?? ''} />;
}
