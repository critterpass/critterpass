import { useLocalSearchParams } from 'expo-router';

import { BuilderScreen } from '@/features/proposal';
import { PREMIUM_BUILDER_VIEWS } from '@/features/proposal/premium/builder-views';

/** The organiser's proposal builder (`/proposal/build?tripId=`). */
export default function ProposalBuildRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <BuilderScreen tripId={tripId} views={PREMIUM_BUILDER_VIEWS} />;
}
