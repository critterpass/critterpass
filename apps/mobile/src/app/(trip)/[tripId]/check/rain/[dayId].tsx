import { useLocalSearchParams } from 'expo-router';

import { RainScreen } from '@/features/plan/check';
import { PremiumRainView } from '@/features/plan/premium/check/fix-pages';
import { usePremiumUi } from '@/lib/premium-ui';

/** Rain and crowds (7h-4): `/{tripId}/check/rain/{dayId}`. */
export default function RainRoute() {
  const { tripId, dayId } = useLocalSearchParams<{ tripId: string; dayId: string }>();
  const premium = usePremiumUi();
  return (
    <RainScreen
      tripId={tripId ?? ''}
      dayId={dayId ?? ''}
      {...(premium ? { View: PremiumRainView } : {})}
    />
  );
}
