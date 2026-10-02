import { useLocalSearchParams } from 'expo-router';

import { BoardScreen } from '@/features/proposal';

/**
 * Slide to board (`/proposal/{id}/board?options=`), the member's savings carried along; with
 * `decline=1` it opens asking whether they can't make it after all.
 */
export default function ProposalBoardRoute() {
  const { id, options, decline } = useLocalSearchParams<{
    id: string;
    options?: string;
    decline?: string;
  }>();
  return (
    <BoardScreen
      proposalId={id}
      options={options ? options.split(',') : []}
      decline={decline === '1'}
    />
  );
}
