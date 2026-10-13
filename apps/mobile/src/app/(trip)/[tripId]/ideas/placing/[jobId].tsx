import { useLocalSearchParams } from 'expo-router';

import { PlacingScreen } from '@/features/plan/ideas';
import { PremiumPlacingView } from '@/features/plan/premium/ideas/placing-view';

/** Tokek is placing them (7h-6; 4.41): `/{tripId}/ideas/placing/{jobId}`. */
export default function PlacingRoute() {
  const { tripId, jobId } = useLocalSearchParams<{ tripId: string; jobId: string }>();
  return <PlacingScreen tripId={tripId ?? ''} jobId={jobId ?? ''} View={PremiumPlacingView} />;
}
