import { useLocalSearchParams } from 'expo-router';

import { TripStreams } from '@/features/trip/hub/local-first-gate';
import { sheetRouteOptions } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';

const ALARM_SHEET = sheetRouteOptions('fit');

/**
 * A trip's day pages: keeps the trip's sync streams while one is open. The leave-by alarm's
 * permission sheet rises over the day page.
 */
export default function TripDayPagesTripLayout() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return (
    <>
      <TripStreams tripId={typeof tripId === 'string' ? tripId : null} />
      <PremiumStack>
        <PremiumStackScreen name="alarm" options={ALARM_SHEET} />
      </PremiumStack>
    </>
  );
}
