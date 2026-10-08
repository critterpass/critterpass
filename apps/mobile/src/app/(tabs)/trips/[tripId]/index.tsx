import { useLocalSearchParams } from 'expo-router';

import { goBackOr } from '@/lib/navigation/back';
import { TRIPS_TAB } from '@/features/trip/hub/routes';
import { TripHubScreen } from '@/features/trip/hub/screen';
import { LocalFirstGate } from '@/features/trip/hub/local-first-gate';

/** One trip's hub (3k-1), opened from the trip switcher, a link or Home's trip card. */
export default function TripHubRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  if (typeof tripId !== 'string') return null;
  return (
    <LocalFirstGate>
      <TripHubScreen tripId={tripId} onSwitch={() => goBackOr(TRIPS_TAB)} />
    </LocalFirstGate>
  );
}
