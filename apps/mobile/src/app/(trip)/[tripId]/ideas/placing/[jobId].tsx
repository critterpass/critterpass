import { useLocalSearchParams } from 'expo-router';

import { PlacingScreen } from '@/features/plan/ideas';
import { PremiumPlacingView } from '@/features/plan/premium/ideas/placing-view';
import { usePremiumUi } from '@/lib/premium-ui';

/** Tokek is placing them (7h-6; 4.41 in the premium look): `/{tripId}/ideas/placing/{jobId}`. */
export default function PlacingRoute() {
  const { tripId, jobId } = useLocalSearchParams<{ tripId: string; jobId: string }>();
  const premium = usePremiumUi();
  return (
    <PlacingScreen
      tripId={tripId ?? ''}
      jobId={jobId ?? ''}
      {...(premium ? { View: PremiumPlacingView } : {})}
    />
  );
}
