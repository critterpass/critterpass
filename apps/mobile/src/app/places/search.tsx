import { useLocalSearchParams } from 'expo-router';

import { SearchSheet } from '@/features/vote/places/search-sheet';
import { VoteSessionGate } from '@/features/vote/session-gate';

export default function PlaceSearchRoute() {
  const { crewId } = useLocalSearchParams<{ crewId?: string }>();
  return (
    <VoteSessionGate>
      <SearchSheet crewId={crewId} />
    </VoteSessionGate>
  );
}
