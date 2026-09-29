import { useLocalSearchParams } from 'expo-router';

import { ShowdownScreen } from '@/features/vote/final/showdown-screen';
import { VoteSessionGate } from '@/features/vote/session-gate';

export default function ShowdownRoute() {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  return (
    <VoteSessionGate>
      <ShowdownScreen pollId={pollId} />
    </VoteSessionGate>
  );
}
