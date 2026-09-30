import { useLocalSearchParams } from 'expo-router';

import { OfflineScreen } from '@/features/trip/offline/offline-screen';
import { LocalFirstGate } from '@/features/trip/hub/local-first-gate';

/** The trip's offline card (3k-4) on its own: what works with no signal and what will send. */
export default function TripOfflineRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' ? (
    <LocalFirstGate>
      <OfflineScreen tripId={tripId} />
    </LocalFirstGate>
  ) : null;
}
