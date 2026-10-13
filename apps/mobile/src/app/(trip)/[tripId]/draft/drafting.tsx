import { useLocalSearchParams } from 'expo-router';

import { DraftingScreen } from '@/features/plan/draft';
import { PremiumDraftingView } from '@/features/plan/premium/draft/drafting-view';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';

/** The guide drafting the trip (`/{tripId}/draft/drafting`); drawn with no back while it runs (3c-8, 4.20). */
export default function DraftingRoute() {
  useNoBackByDesign();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <DraftingScreen tripId={tripId} View={PremiumDraftingView} />;
}
