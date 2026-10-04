import { useLocalSearchParams } from 'expo-router';

import { IdeasScreen } from '@/features/plan/ideas';

/** Ideas (7f-2): `/{tripId}/ideas`. */
export default function IdeasRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <IdeasScreen tripId={tripId ?? ''} />;
}
