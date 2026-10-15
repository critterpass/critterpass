import { useLocalSearchParams } from 'expo-router';

import { PremiumMemoryScreen } from '@/features/recap/premium/memory-screen';
import { PremiumRouteMissing } from '@/features/album';

function useMemoryParams() {
  const { memoryId, trip } = useLocalSearchParams<{ memoryId: string; trip?: string }>();
  return {
    memoryId: typeof memoryId === 'string' ? memoryId : '',
    tripId: typeof trip === 'string' && trip !== '' ? trip : null,
  };
}

/** A trip's year-later memory (3m-10), where the anniversary push lands. */
export default function MemoryRoute() {
  const { memoryId, tripId } = useMemoryParams();
  return memoryId !== '' ? (
    <PremiumMemoryScreen memoryId={memoryId} tripId={tripId} />
  ) : (
    <PremiumRouteMissing testID="memory-missing" />
  );
}
