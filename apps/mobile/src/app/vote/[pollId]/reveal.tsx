import { useLocalSearchParams } from 'expo-router';

import { WinnerRevealScreen } from '@/features/vote/final/winner-reveal';
import { VoteSessionGate } from '@/features/vote/session-gate';

export default function WinnerRevealRoute() {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  return (
    <VoteSessionGate>
      <WinnerRevealScreen pollId={pollId} />
    </VoteSessionGate>
  );
}
