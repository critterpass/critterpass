import { useLocalSearchParams } from 'expo-router';

import { SharedPlanPremiumScreen } from '@/features/community/premium/shared-plan-premium-screen';

/** A shared crew plan (3o-2); `tripId` is the trip it would be copied into. */
export default function SharedPlanRoute() {
  const { sharedPlanId, tripId } = useLocalSearchParams<{
    sharedPlanId: string;
    tripId?: string;
  }>();
  return typeof sharedPlanId === 'string' && sharedPlanId.length > 0 ? (
    <SharedPlanPremiumScreen
      sharedPlanId={sharedPlanId}
      tripId={typeof tripId === 'string' && tripId !== '' ? tripId : null}
    />
  ) : null;
}
