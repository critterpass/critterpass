import { useLocalSearchParams } from 'expo-router';

import { BuilderScreen } from '@/features/proposal';

/** The organiser's proposal builder (`/proposal/build?tripId=`). */
export default function ProposalBuildRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <BuilderScreen tripId={tripId} />;
}
