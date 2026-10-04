import { useLocalSearchParams } from 'expo-router';

import { LocalFirstGate } from '@/features/explore';
import { SplitScreen } from '@/features/explore/split/split-screen';

/** Crew can't agree on a place (7e-3). */
export default function SplitRoute() {
  const { tripId, placeId } = useLocalSearchParams<{ tripId: string; placeId: string }>();
  return (
    <LocalFirstGate>
      <SplitScreen tripId={tripId} placeId={placeId} />
    </LocalFirstGate>
  );
}
