import { useLocalSearchParams } from 'expo-router';

import { YourVersionScreen } from '@/features/proposal';
import { PREMIUM_VERSION_LOOK } from '@/features/proposal/premium/version/version-look';

function useVersionParams() {
  const { id, as } = useLocalSearchParams<{ id: string; as?: string }>();
  return { proposalId: id, ...(as ? { as } : {}) };
}

/** The member's version as a pushed page with its glass back. */
export default function ProposalRoute() {
  return <YourVersionScreen {...useVersionParams()} look={PREMIUM_VERSION_LOOK} />;
}
