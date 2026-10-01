import { useLocalSearchParams } from 'expo-router';

import { LocalFirstGate, SwipeScreen } from '@/features/explore';

/** Swipe together for a trip (3d-2): a session by id, or `new` to join or start one. */
export default function SwipeRoute() {
  const { tripId, sessionId } = useLocalSearchParams<{ tripId: string; sessionId: string }>();
  return (
    <LocalFirstGate>
      <SwipeScreen tripId={tripId} sessionId={sessionId} />
    </LocalFirstGate>
  );
}
