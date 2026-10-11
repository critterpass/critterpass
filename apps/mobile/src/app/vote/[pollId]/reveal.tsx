import { useLocalSearchParams } from 'expo-router';

import { WinnerRevealScreen } from '@/features/vote/final/winner-reveal';
import { PremiumWinnerRevealScreen } from '@/features/vote/premium/final/winner-reveal';
import { premiumRoute } from '@/lib/premium-ui';

function usePollId(): string {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  return pollId;
}

function CurrentWinnerRevealRoute() {
  return <WinnerRevealScreen pollId={usePollId()} />;
}

/** The winner stamp (4.06), full screen with its ✕. */
function PremiumWinnerRevealRoute() {
  return <PremiumWinnerRevealScreen pollId={usePollId()} />;
}

export default premiumRoute({
  premium: PremiumWinnerRevealRoute,
  legacy: CurrentWinnerRevealRoute,
});
