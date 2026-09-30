import { useLocalSearchParams } from 'expo-router';

import { BoardScreen } from '@/features/proposal';

/** Slide to board (`/proposal/{id}/board?options=`), the member's savings carried along. */
export default function ProposalBoardRoute() {
  const { id, options } = useLocalSearchParams<{ id: string; options?: string }>();
  return <BoardScreen proposalId={id} options={options ? options.split(',') : []} />;
}
