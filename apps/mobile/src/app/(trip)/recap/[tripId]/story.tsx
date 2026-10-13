import { Stack, useLocalSearchParams } from 'expo-router';

import { PREMIUM_STORY_LOOK } from '@/features/recap/premium/story/story-parts';
import { PremiumRouteMissing } from '@/features/album';
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
      <RecapStoryScreen tripId={tripId} replay={from === 'summary'} look={PREMIUM_STORY_LOOK} />
    </>
  ) : (
    <PremiumRouteMissing testID="recap-story-missing" />
  );
}
