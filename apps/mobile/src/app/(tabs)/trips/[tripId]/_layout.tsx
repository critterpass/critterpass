import { useLocalSearchParams } from 'expo-router';

import { TripAccessGate } from '@/features/trip/access/trip-access-gate';
import { TripStreams } from '@/features/trip/hub/local-first-gate';
import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';

/**
 * One trip inside the TRIPS tab: keeps the trip's sync streams while a link passes through here on
 * its way to the hub over the tabs, and shows the "not here" page for a trip this person cannot read.
 */
export default function TripHubLayout() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return (
    <TripAccessGate tripId={tripId}>
      <TripStreams tripId={typeof tripId === 'string' ? tripId : null} />
      <PremiumStack />
    </TripAccessGate>
  );
}
