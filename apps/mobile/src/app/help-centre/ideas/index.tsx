import { useLocalSearchParams } from 'expo-router';

import { BoardScreen } from '@/features/help/ideas/board-screen';
import { IdeaBoardPremiumScreen } from '@/features/help/premium/idea-board-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** The idea board (3p-4; premium 9.07); `?suggest=1` opens Suggest an idea (3p-5) over it. */
function LegacyIdeasRoute() {
  const { suggest } = useLocalSearchParams<{ suggest?: string }>();
  return <BoardScreen suggestOpen={suggest === '1'} />;
}

export default premiumRoute({ premium: IdeaBoardPremiumScreen, legacy: LegacyIdeasRoute });
