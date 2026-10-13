import { useLocalSearchParams } from 'expo-router';

import { RouteScreen } from '@/features/setup/premium/route/route-screen';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId;
}

/** The route: the trip's stops and their nights (4.19). */
export default function RouteRoute() {
  return <RouteScreen tripId={useTripId()} />;
}
