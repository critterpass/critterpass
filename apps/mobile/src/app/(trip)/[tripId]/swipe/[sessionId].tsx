import { useLocalSearchParams } from 'expo-router';

import { SwipeScreen } from '@/features/explore';
import { SwipePage } from '@/features/explore/premium/swipe/swipe-page';
import { usePremiumUi } from '@/lib/premium-ui';

/** Swipe together for a trip (7g-2; 4.42 in the premium look): a session by id, or `new`. */
export default function SwipeRoute() {
  const { tripId, sessionId } = useLocalSearchParams<{ tripId: string; sessionId: string }>();
  const Screen = usePremiumUi() ? SwipePage : SwipeScreen;
  return <Screen tripId={tripId} sessionId={sessionId} />;
}
