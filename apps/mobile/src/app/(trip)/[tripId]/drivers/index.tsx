import { useLocalSearchParams } from 'expo-router';

import { FindDriverPremium } from '@/features/drivers/premium/FindDriverPremium';

/** Find a driver (6a-2, 6.19): `/{tripId}/drivers?days=`. */
export default function FindDriverRoute() {
  const { tripId, days } = useLocalSearchParams<{ tripId: string; days?: string }>();
  const props = { tripId: tripId ?? '', ...(days ? { days } : {}) };
  return <FindDriverPremium {...props} />;
}
