import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/js-stack';

import { useTripStreams } from '@/data/powersync/use-trip-streams';

/** A trip's day pages: keeps the trip's sync streams while one is open. */
export default function TripDayPagesTripLayout() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  useTripStreams(typeof tripId === 'string' ? tripId : null);
  return <Stack screenOptions={{ headerShown: false }} />;
}
