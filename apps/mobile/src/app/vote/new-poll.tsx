import { useLocalSearchParams } from 'expo-router';

import { CreatePollSheet } from '@/features/vote/poll/create-poll-sheet';
import { VoteSessionGate } from '@/features/vote/session-gate';

export default function NewPollRoute() {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  return (
    <VoteSessionGate>
      <CreatePollSheet crewId={crewId} />
    </VoteSessionGate>
  );
}
