import { useLocalSearchParams } from 'expo-router';

import { PitchSheet } from '@/features/vote/board/pitch-sheet';
import { VoteSessionGate } from '@/features/vote/session-gate';

export default function PitchRoute() {
  const { crewId, placeId } = useLocalSearchParams<{ crewId: string; placeId?: string }>();
  return (
    <VoteSessionGate>
      <PitchSheet crewId={crewId} placeId={placeId} />
    </VoteSessionGate>
  );
}
