import { useLocalSearchParams } from 'expo-router';

import { SharePlanScreen } from '@/features/community/publish/publish-screen';

/** Share the plan (3o-4), with the consent card and the published plan's page. */
export default function SharePlanRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? (
    <SharePlanScreen tripId={tripId} />
  ) : null;
}
