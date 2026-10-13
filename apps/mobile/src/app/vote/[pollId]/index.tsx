import { useLocalSearchParams } from 'expo-router';

import { PremiumShowdownScreen } from '@/features/vote/premium/final/showdown-screen';

function usePollId(): string {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  return pollId;
}

/** The final round (4.05): two guide cards, VS between them, a button each. */
export default function ShowdownRoute() {
  return <PremiumShowdownScreen pollId={usePollId()} />;
}
