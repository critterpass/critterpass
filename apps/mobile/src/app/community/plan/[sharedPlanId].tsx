import { useLocalSearchParams } from 'expo-router';

import { SharedPlanScreen } from '@/features/community/detail/detail-screen';
import { SharedPlanPremiumScreen } from '@/features/community/premium/shared-plan-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

const SharedPlan = premiumRoute({ premium: SharedPlanPremiumScreen, legacy: SharedPlanScreen });

/** A shared crew plan (3o-2); `tripId` is the trip it would be copied into. */
export default function SharedPlanRoute() {
  const { sharedPlanId, tripId } = useLocalSearchParams<{
    sharedPlanId: string;
    tripId?: string;
  }>();
  return typeof sharedPlanId === 'string' && sharedPlanId.length > 0 ? (
    <SharedPlan
      sharedPlanId={sharedPlanId}
      tripId={typeof tripId === 'string' && tripId !== '' ? tripId : null}
    />
  ) : null;
}
