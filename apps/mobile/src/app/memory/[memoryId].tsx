import { useLocalSearchParams } from 'expo-router';

import { MemoryScreen } from '@/features/recap/memory/memory-screen';
import { PremiumMemoryScreen } from '@/features/recap/premium/memory-screen';
import { RouteMissing } from '@/features/recap/route-missing';
import { premiumRoute } from '@/lib/premium-ui';

function useMemoryParams() {
  const { memoryId, trip } = useLocalSearchParams<{ memoryId: string; trip?: string }>();
  return {
    memoryId: typeof memoryId === 'string' ? memoryId : '',
    tripId: typeof trip === 'string' && trip !== '' ? trip : null,
  };
}

function CurrentMemoryRoute() {
  const { memoryId, tripId } = useMemoryParams();
  return memoryId !== '' ? (
    <MemoryScreen memoryId={memoryId} tripId={tripId} />
  ) : (
    <RouteMissing testID="memory-missing" />
  );
}

function PremiumMemoryRoute() {
  const { memoryId, tripId } = useMemoryParams();
  return memoryId !== '' ? (
    <PremiumMemoryScreen memoryId={memoryId} tripId={tripId} />
  ) : (
    <RouteMissing testID="memory-missing" />
  );
}

/** A trip's year-later memory (3m-10), where the anniversary push lands. */
export default premiumRoute({ premium: PremiumMemoryRoute, legacy: CurrentMemoryRoute });
