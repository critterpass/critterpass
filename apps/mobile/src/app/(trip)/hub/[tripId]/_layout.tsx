import { useLocalSearchParams } from 'expo-router';

import { TripStreams } from '@/features/trip/hub/local-first-gate';
import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';

/** A trip's day pages: keeps the trip's sync streams while one is open. */
export default function TripDayPagesTripLayout() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return (
    <>
      <TripStreams tripId={typeof tripId === 'string' ? tripId : null} />
      <PremiumStack />
    </>
  );
}
