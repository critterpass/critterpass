import { useLocalSearchParams } from 'expo-router';

import { LessDrivingScreen } from '@/features/plan/check';
import { PremiumLessDrivingView } from '@/features/plan/premium/check/fix-pages';
import { usePremiumUi } from '@/lib/premium-ui';

/** Less driving (7h-3): `/{tripId}/check/less-driving/{dayId}`. */
export default function LessDrivingRoute() {
  const { tripId, dayId } = useLocalSearchParams<{ tripId: string; dayId: string }>();
  const premium = usePremiumUi();
  return (
    <LessDrivingScreen
      tripId={tripId ?? ''}
      dayId={dayId ?? ''}
      {...(premium ? { View: PremiumLessDrivingView } : {})}
    />
  );
}
