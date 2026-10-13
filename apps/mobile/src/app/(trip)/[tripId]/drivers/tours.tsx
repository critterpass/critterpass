import { useLocalSearchParams } from 'expo-router';

import { PrivateToursPremium } from '@/features/drivers/premium/PrivateToursPremium';

/** Private cars with a driver from Klook and Viator (6f-1, 6.21): `/{tripId}/drivers/tours?days=`. */
export default function PrivateToursRoute() {
  const { tripId, days } = useLocalSearchParams<{ tripId: string; days?: string }>();
  const props = { tripId: tripId ?? '', ...(days ? { days } : {}) };
  return <PrivateToursPremium {...props} />;
}
