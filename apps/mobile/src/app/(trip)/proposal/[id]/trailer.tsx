import { useLocalSearchParams } from 'expo-router';

import { TrailerScreen } from '@/features/proposal';

/** The proposal trailer (`/proposal/{id}/trailer`). */
export default function ProposalTrailerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TrailerScreen proposalId={id} />;
}
