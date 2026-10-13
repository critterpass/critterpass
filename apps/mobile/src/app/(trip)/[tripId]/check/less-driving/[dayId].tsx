import { useLocalSearchParams } from 'expo-router';

import { LessDrivingScreen } from '@/features/plan/check';
import { PremiumLessDrivingView } from '@/features/plan/premium/check/fix-pages';

/** Less driving (7h-3): `/{tripId}/check/less-driving/{dayId}`. */
export default function LessDrivingRoute() {
  const { tripId, dayId } = useLocalSearchParams<{ tripId: string; dayId: string }>();
  return (
    <LessDrivingScreen tripId={tripId ?? ''} dayId={dayId ?? ''} View={PremiumLessDrivingView} />
  );
}
