import { useLocalSearchParams } from 'expo-router';

import { BoardScreen } from '@/features/help/ideas/board-screen';

/** The idea board (3p-4); `?suggest=1` opens Suggest an idea (3p-5) over it. */
export default function HelpIdeasRoute() {
  const { suggest } = useLocalSearchParams<{ suggest?: string }>();
  return <BoardScreen suggestOpen={suggest === '1'} />;
}
