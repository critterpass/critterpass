import { Redirect, useLocalSearchParams } from 'expo-router';

import { tripPlanRoutes } from '@/features/plan/hub/routes';

/** The plan is one map (4.25–4.27): PLAN replaces itself with it. */
export default function PlanRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <Redirect href={tripPlanRoutes.map(tripId ?? '')} />;
}
