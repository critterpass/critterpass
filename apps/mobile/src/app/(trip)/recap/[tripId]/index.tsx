import { useLocalSearchParams } from 'expo-router';

import { RecapSummaryScreen } from '@/features/recap/summary/summary-screen';

/** The trip's recap page (3m-1), also where the recap-ready push lands (`/recap/<tripId>`). */
export default function RecapRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? (
    <RecapSummaryScreen tripId={tripId} />
  ) : null;
}
