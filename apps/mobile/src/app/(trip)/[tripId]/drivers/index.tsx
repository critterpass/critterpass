import { useLocalSearchParams } from 'expo-router';

import { FindDriverScreen } from '@/features/drivers/find/FindDriverScreen';

/** Find a driver (6a-2): `/{tripId}/drivers?days=`. */
export default function FindDriverRoute() {
  const { tripId, days } = useLocalSearchParams<{ tripId: string; days?: string }>();
  return <FindDriverScreen tripId={tripId ?? ''} {...(days ? { days } : {})} />;
}
