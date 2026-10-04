import { useLocalSearchParams } from 'expo-router';

import { RainScreen } from '@/features/plan/check';

/** Rain and crowds (7h-4): `/{tripId}/check/rain/{dayId}`. */
export default function RainRoute() {
  const { tripId, dayId } = useLocalSearchParams<{ tripId: string; dayId: string }>();
  return <RainScreen tripId={tripId ?? ''} dayId={dayId ?? ''} />;
}
