import { useLocalSearchParams } from 'expo-router';

import { PremiumWinnerRevealScreen } from '@/features/vote/premium/final/winner-reveal';

function usePollId(): string {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  return pollId;
}

/** The winner stamp (4.06), full screen with its ✕. */
export default function WinnerRevealRoute() {
  return <PremiumWinnerRevealScreen pollId={usePollId()} />;
}
