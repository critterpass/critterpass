import { useLocalSearchParams } from 'expo-router';

import { DropoutScreen } from '@/features/proposal';

/** A member's dropout and the re-split it proposes (`/proposal/{id}/dropout?uid=`). */
export default function ProposalDropoutRoute() {
  const { id, uid } = useLocalSearchParams<{ id: string; uid: string }>();
  return <DropoutScreen proposalId={id} uid={uid} />;
}
