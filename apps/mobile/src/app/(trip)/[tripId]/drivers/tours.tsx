import { useLocalSearchParams } from 'expo-router';

import { PrivateToursScreen } from '@/features/drivers/private-tours/PrivateToursScreen';

/** Private cars with a driver from Klook and Viator (6f-1): `/{tripId}/drivers/tours?days=`. */
export default function PrivateToursRoute() {
  const { tripId, days } = useLocalSearchParams<{ tripId: string; days?: string }>();
  return <PrivateToursScreen tripId={tripId ?? ''} {...(days ? { days } : {})} />;
}
