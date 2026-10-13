import { useLocalSearchParams } from 'expo-router';

import { PremiumBoardScreen } from '@/features/vote/premium/board/board-screen';

function usePollId(): string {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  return pollId;
}

/** The pitch board (3.02) as a page: the crew's places, their votes and the organiser's next move. */
export default function BoardRoute() {
  return <PremiumBoardScreen pollId={usePollId()} />;
}
