import { useLocalSearchParams } from 'expo-router';

import { SplitScreen } from '@/features/explore/split/split-screen';

/** Crew can't agree on a place (7e-3). */
export default function SplitRoute() {
  const { tripId, placeId } = useLocalSearchParams<{ tripId: string; placeId: string }>();
  return <SplitScreen tripId={tripId} placeId={placeId} />;
}
