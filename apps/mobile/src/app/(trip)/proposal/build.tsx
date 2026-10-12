import { useLocalSearchParams } from 'expo-router';

import { BuilderScreen } from '@/features/proposal';
import { PREMIUM_BUILDER_VIEWS } from '@/features/proposal/premium/builder-views';
import { usePremiumUi } from '@/lib/premium-ui';

/** The organiser's proposal builder (`/proposal/build?tripId=`), in the premium look when it is on. */
export default function ProposalBuildRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const premium = usePremiumUi();
  return <BuilderScreen tripId={tripId} {...(premium ? { views: PREMIUM_BUILDER_VIEWS } : {})} />;
}
