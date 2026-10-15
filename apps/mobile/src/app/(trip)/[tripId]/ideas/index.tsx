import { useLocalSearchParams } from 'expo-router';

import { IdeasSheet } from '@/features/plan/premium/ideas/ideas-sheet';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId ?? '';
}

/** Ideas as a sheet over the plan map (4.40), with must-do stars. */
export default function IdeasRoute() {
  return <IdeasSheet tripId={useTripId()} />;
}
