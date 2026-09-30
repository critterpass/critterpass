import { useLocalSearchParams } from 'expo-router';

import { DayScreen } from '@/features/plan/day/day-screen';

/** One day of the trip plan (`/{tripId}/day/{n}`, 3e-2): the list, or the timeline in planning mode. */
export default function PlanDayRoute() {
  const { tripId, day } = useLocalSearchParams<{ tripId: string; day: string }>();
  return <DayScreen tripId={tripId} dayNo={Number(day)} />;
}
