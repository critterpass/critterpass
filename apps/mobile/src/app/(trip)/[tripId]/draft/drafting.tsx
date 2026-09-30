import { useLocalSearchParams } from 'expo-router';

import { DraftingScreen } from '@/features/plan/draft';

/** The guide drafting the trip (`/{tripId}/draft/drafting`). */
export default function DraftingRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <DraftingScreen tripId={tripId} />;
}
