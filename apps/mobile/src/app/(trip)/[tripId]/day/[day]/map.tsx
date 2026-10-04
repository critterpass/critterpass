import { useLocalSearchParams } from 'expo-router';

import { DayMapScreen } from '@/features/plan/day-plan/day-map-screen';

/** One day's map, open full screen (7b-2): `/{tripId}/day/{n}/map`. */
export default function PlanDayMapRoute() {
  const { tripId, day } = useLocalSearchParams<{ tripId: string; day: string }>();
  return <DayMapScreen tripId={tripId} dayNo={Number(day)} />;
}
