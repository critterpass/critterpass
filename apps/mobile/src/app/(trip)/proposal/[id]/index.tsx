import { useLocalSearchParams } from 'expo-router';

import { YourVersionScreen } from '@/features/proposal';
import { PREMIUM_VERSION_LOOK } from '@/features/proposal/premium/version/version-look';
import { premiumRoute } from '@/lib/premium-ui';

function useVersionParams() {
  const { id, as } = useLocalSearchParams<{ id: string; as?: string }>();
  return { proposalId: id, ...(as ? { as } : {}) };
}

/** A proposal (`/proposal/{id}`, `?as=` for the organiser's preview of someone's version). */
function CurrentProposalRoute() {
  return <YourVersionScreen {...useVersionParams()} />;
}

/** The member's version as a pushed page with its glass back. */
function PremiumProposalRoute() {
  return <YourVersionScreen {...useVersionParams()} look={PREMIUM_VERSION_LOOK} />;
}

export default premiumRoute({ premium: PremiumProposalRoute, legacy: CurrentProposalRoute });
