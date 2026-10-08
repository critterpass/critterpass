import { Stack, useLocalSearchParams } from 'expo-router';

import { RouteMissing } from '@/features/recap/route-missing';
import { RecapStoryScreen } from '@/features/recap/story/story-screen';

/**
 * The recap story (3m-3…3m-8): plays first, then settles into the recap page. Leaving is the
 * story's own close (or the phone's back, which does the same), never a swipe past the recap page.
 */
export default function RecapStoryRoute() {
  const { tripId, from } = useLocalSearchParams<{ tripId: string; from?: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <RecapStoryScreen tripId={tripId} replay={from === 'summary'} />
    </>
  ) : (
    <RouteMissing testID="recap-story-missing" />
  );
}
