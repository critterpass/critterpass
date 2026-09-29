import { useLocalSearchParams } from 'expo-router';

import { GuestGuidePage } from '@/features/vote/places/guest-guide-page';
import { VoteSessionGate } from '@/features/vote/session-gate';

export default function PlaceRoute() {
  const { placeId, crewId } = useLocalSearchParams<{ placeId: string; crewId?: string }>();
  return (
    <VoteSessionGate>
      <GuestGuidePage placeId={placeId} crewId={crewId} />
    </VoteSessionGate>
  );
}
