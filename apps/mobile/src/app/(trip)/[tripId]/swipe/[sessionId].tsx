import { useLocalSearchParams } from 'expo-router';

import { SwipePage } from '@/features/explore/premium/swipe/swipe-page';

/** Swipe together for a trip (7g-2; 4.42): a session by id, or `new`. */
export default function SwipeRoute() {
  const { tripId, sessionId } = useLocalSearchParams<{ tripId: string; sessionId: string }>();
  return <SwipePage tripId={tripId} sessionId={sessionId} />;
}
