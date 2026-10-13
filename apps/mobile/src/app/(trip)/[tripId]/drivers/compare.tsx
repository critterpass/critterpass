import { useLocalSearchParams } from 'expo-router';

import { ComparePremium } from '@/features/drivers/premium/ComparePremium';

/** Compare the shortlist (6d-1, 6.23): `/{tripId}/drivers/compare?days=`. */
export default function CompareRoute() {
  const { tripId, days } = useLocalSearchParams<{ tripId: string; days?: string }>();
  const props = { tripId: tripId ?? '', ...(days ? { days } : {}) };
  return <ComparePremium {...props} />;
}
