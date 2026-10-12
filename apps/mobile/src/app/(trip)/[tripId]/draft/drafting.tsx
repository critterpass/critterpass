import { useLocalSearchParams } from 'expo-router';

import { DraftingScreen } from '@/features/plan/draft';
import { PremiumDraftingView } from '@/features/plan/premium/draft/drafting-view';
import { usePremiumUi } from '@/lib/premium-ui';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';

/** The guide drafting the trip (`/{tripId}/draft/drafting`); drawn with no back while it runs (3c-8, 4.20). */
export default function DraftingRoute() {
  useNoBackByDesign();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const premium = usePremiumUi();
  return <DraftingScreen tripId={tripId} {...(premium ? { View: PremiumDraftingView } : {})} />;
}
