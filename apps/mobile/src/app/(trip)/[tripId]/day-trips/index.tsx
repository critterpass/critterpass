import { useLocalSearchParams } from 'expo-router';

import { DayTripsScreen } from '@/features/explore/premium/day-trips/day-trips-screen';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId;
}

/** Day trips from the stop (4.49). */
export default function DayTripsRoute() {
  return <DayTripsScreen tripId={useTripId()} />;
}
