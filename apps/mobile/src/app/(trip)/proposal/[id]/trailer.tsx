import { useLocalSearchParams } from 'expo-router';

import { TrailerScreen } from '@/features/proposal';
import { PremiumTrailerView } from '@/features/proposal/premium/trailer/trailer-view';

function useProposalId(): string {
  return useLocalSearchParams<{ id: string }>().id;
}

/** The trailer as a full-bleed story with its ✕, swipe down to close. */
export default function TrailerRoute() {
  return <TrailerScreen proposalId={useProposalId()} View={PremiumTrailerView} />;
}
