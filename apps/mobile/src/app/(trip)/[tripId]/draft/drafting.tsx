import { useLocalSearchParams } from 'expo-router';

import { DraftingScreen } from '@/features/plan/draft';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';

/** The guide drafting the trip (`/{tripId}/draft/drafting`); drawn with no back while it runs (3c-8). */
export default function DraftingRoute() {
  useNoBackByDesign();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <DraftingScreen tripId={tripId} />;
}
