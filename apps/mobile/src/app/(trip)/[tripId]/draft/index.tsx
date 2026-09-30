import { useLocalSearchParams } from 'expo-router';

import { DraftReviewScreen } from '@/features/plan/draft';

/** The organiser's private draft (`/{tripId}/draft`). */
export default function DraftRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <DraftReviewScreen tripId={tripId} />;
}
