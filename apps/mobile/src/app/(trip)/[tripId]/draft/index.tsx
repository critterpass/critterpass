import { useLocalSearchParams } from 'expo-router';

import { DraftReviewScreen } from '@/features/plan/draft';
import { PremiumDraftReviewView } from '@/features/plan/premium/draft/draft-review-view';

/** The organiser's private draft (`/{tripId}/draft`; 4.22). */
export default function DraftRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <DraftReviewScreen tripId={tripId} View={PremiumDraftReviewView} />;
}
