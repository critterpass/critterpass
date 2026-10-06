import { useLocalSearchParams } from 'expo-router';

import { MemoryScreen } from '@/features/recap/memory/memory-screen';

/** A trip's year-later memory (3m-10), where the anniversary push lands. */
export default function MemoryRoute() {
  const { memoryId, trip } = useLocalSearchParams<{ memoryId: string; trip?: string }>();
  return typeof memoryId === 'string' && memoryId !== '' ? (
    <MemoryScreen
      memoryId={memoryId}
      tripId={typeof trip === 'string' && trip !== '' ? trip : null}
    />
  ) : null;
}
