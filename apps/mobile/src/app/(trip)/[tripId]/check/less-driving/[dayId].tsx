import { useLocalSearchParams } from 'expo-router';

import { LessDrivingScreen } from '@/features/plan/check';

/** Less driving (7h-3): `/{tripId}/check/less-driving/{dayId}`. */
export default function LessDrivingRoute() {
  const { tripId, dayId } = useLocalSearchParams<{ tripId: string; dayId: string }>();
  return <LessDrivingScreen tripId={tripId ?? ''} dayId={dayId ?? ''} />;
}
