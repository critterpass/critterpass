import { useLocalSearchParams } from 'expo-router';

import { ShowdownScreen } from '@/features/vote/final/showdown-screen';
import { PremiumShowdownScreen } from '@/features/vote/premium/final/showdown-screen';
import { premiumRoute } from '@/lib/premium-ui';

function usePollId(): string {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  return pollId;
}

function CurrentShowdownRoute() {
  return <ShowdownScreen pollId={usePollId()} />;
}

/** The final round (4.05): two guide cards, VS between them, a button each. */
function PremiumShowdownRoute() {
  return <PremiumShowdownScreen pollId={usePollId()} />;
}

export default premiumRoute({ premium: PremiumShowdownRoute, legacy: CurrentShowdownRoute });
