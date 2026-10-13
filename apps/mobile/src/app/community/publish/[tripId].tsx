import { useLocalSearchParams } from 'expo-router';

import { SharePlanPremiumScreen } from '@/features/community/premium/share-plan-premium-screen';
import { SharePlanScreen } from '@/features/community/publish/publish-screen';
import { premiumRoute } from '@/lib/premium-ui';

const SharePlan = premiumRoute({ premium: SharePlanPremiumScreen, legacy: SharePlanScreen });

/** Share the plan (3o-4), with the consent card and the published plan's page. */
export default function SharePlanRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? <SharePlan tripId={tripId} /> : null;
}
