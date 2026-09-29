import { useLocalSearchParams } from 'expo-router';

import { WinnerRevealScreen } from '@/features/vote/final/winner-reveal';

export default function WinnerRevealRoute() {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  return <WinnerRevealScreen pollId={pollId} />;
}
