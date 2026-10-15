import { useLocalSearchParams } from 'expo-router';

import { SplitPage } from '@/features/explore/premium/split/split-page';

/** Crew can't agree on a place (7e-3; 4.38). */
export default function SplitRoute() {
  const { tripId, placeId } = useLocalSearchParams<{ tripId: string; placeId: string }>();
  return <SplitPage tripId={tripId} placeId={placeId} />;
}
