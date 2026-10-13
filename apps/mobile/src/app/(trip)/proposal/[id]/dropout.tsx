import { useLocalSearchParams } from 'expo-router';

import { DropoutScreen } from '@/features/proposal';
import { PremiumDropoutView } from '@/features/proposal/premium/dropout-view';

function useDropoutParams() {
  const { id, uid } = useLocalSearchParams<{ id: string; uid: string }>();
  return { proposalId: id, uid };
}

/** The dropout as a pushed page with its glass back. */
export default function DropoutRoute() {
  return <DropoutScreen {...useDropoutParams()} View={PremiumDropoutView} />;
}
