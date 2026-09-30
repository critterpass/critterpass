import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/js-stack';

import { TripStreams } from '@/features/trip/hub/local-first-gate';

/** A trip's day pages: keeps the trip's sync streams while one is open. */
export default function TripDayPagesTripLayout() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return (
    <>
      <TripStreams tripId={typeof tripId === 'string' ? tripId : null} />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
