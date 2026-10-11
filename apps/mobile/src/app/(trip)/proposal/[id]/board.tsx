import { useLocalSearchParams } from 'expo-router';

import { BoardScreen } from '@/features/proposal';
import { PremiumBoardView } from '@/features/proposal/premium/board-view';
import { usePremiumUi } from '@/lib/premium-ui';

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
  const premium = usePremiumUi();
  return (
    <BoardScreen
      proposalId={id}
      options={options ? options.split(',') : []}
      decline={decline === '1'}
      {...(premium ? { View: PremiumBoardView } : {})}
    />
  );
}
