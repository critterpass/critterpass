import { useLocalSearchParams } from 'expo-router';

import { DropoutScreen } from '@/features/proposal';
import { PremiumDropoutView } from '@/features/proposal/premium/dropout-view';
import { premiumRoute } from '@/lib/premium-ui';

function useDropoutParams() {
  const { id, uid } = useLocalSearchParams<{ id: string; uid: string }>();
  return { proposalId: id, uid };
}

/** A member's dropout and the re-split it proposes (`/proposal/{id}/dropout?uid=`). */
function CurrentDropoutRoute() {
  return <DropoutScreen {...useDropoutParams()} />;
}

/** The dropout as a pushed page with its glass back. */
function PremiumDropoutRoute() {
  return <DropoutScreen {...useDropoutParams()} View={PremiumDropoutView} />;
}

export default premiumRoute({ premium: PremiumDropoutRoute, legacy: CurrentDropoutRoute });
