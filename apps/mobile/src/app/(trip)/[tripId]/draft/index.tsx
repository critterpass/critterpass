import { useLocalSearchParams } from 'expo-router';

import { DraftReviewScreen } from '@/features/plan/draft';
import { PremiumDraftReviewView } from '@/features/plan/premium/draft/draft-review-view';
import { usePremiumUi } from '@/lib/premium-ui';

/** The organiser's private draft (`/{tripId}/draft`; 4.22 in the premium look). */
export default function DraftRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const premium = usePremiumUi();
  return (
    <DraftReviewScreen tripId={tripId} {...(premium ? { View: PremiumDraftReviewView } : {})} />
  );
}
