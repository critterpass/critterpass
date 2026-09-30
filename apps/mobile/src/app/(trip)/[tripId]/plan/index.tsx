import { useLocalSearchParams } from 'expo-router';

import { PlanScreen } from '@/features/plan';

/** The trip plan overview (3e-1): `/{tripId}/plan`. */
export default function PlanRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <PlanScreen tripId={tripId ?? ''} />;
}
