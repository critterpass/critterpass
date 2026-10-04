import { useLocalSearchParams } from 'expo-router';

import { PlacingScreen } from '@/features/plan/ideas';

/** Tokek is placing them (7h-6): `/{tripId}/ideas/placing/{jobId}`. */
export default function PlacingRoute() {
  const { tripId, jobId } = useLocalSearchParams<{ tripId: string; jobId: string }>();
  return <PlacingScreen tripId={tripId ?? ''} jobId={jobId ?? ''} />;
}
