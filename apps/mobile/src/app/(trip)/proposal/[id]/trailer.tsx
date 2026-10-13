import { useLocalSearchParams } from 'expo-router';

import { TrailerScreen } from '@/features/proposal';
import { PremiumTrailerView } from '@/features/proposal/premium/trailer/trailer-view';
import { premiumRoute } from '@/lib/premium-ui';

function useProposalId(): string {
  return useLocalSearchParams<{ id: string }>().id;
}

/** The proposal trailer (`/proposal/{id}/trailer`). */
function CurrentTrailerRoute() {
  return <TrailerScreen proposalId={useProposalId()} />;
}

/** The trailer as a full-bleed story with its ✕, swipe down to close. */
function PremiumTrailerRoute() {
  return <TrailerScreen proposalId={useProposalId()} View={PremiumTrailerView} />;
}

export default premiumRoute({ premium: PremiumTrailerRoute, legacy: CurrentTrailerRoute });
