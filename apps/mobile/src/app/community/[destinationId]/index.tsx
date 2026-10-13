import { useLocalSearchParams } from 'expo-router';

import { CrewPlansScreen } from '@/features/community/browse/browse-screen';
import { CrewPlansPremiumScreen } from '@/features/community/premium/crew-plans-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

const CrewPlans = premiumRoute({ premium: CrewPlansPremiumScreen, legacy: CrewPlansScreen });

/** Crew plans (3o-1) for a destination (id or slug), ranked for the crew of `tripId` when given. */
export default function CrewPlansRoute() {
  const { destinationId, tripId } = useLocalSearchParams<{
    destinationId: string;
    tripId?: string;
  }>();
  return typeof destinationId === 'string' && destinationId.length > 0 ? (
    <CrewPlans
      destination={destinationId}
      tripId={typeof tripId === 'string' && tripId !== '' ? tripId : null}
    />
  ) : null;
}
