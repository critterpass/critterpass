import { useLocalSearchParams } from 'expo-router';

import { RecapStoryScreen } from '@/features/recap/story/story-screen';

/** The recap story (3m-3…3m-8): plays first, then settles into the recap page. */
export default function RecapStoryRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? (
    <RecapStoryScreen tripId={tripId} />
  ) : null;
}
