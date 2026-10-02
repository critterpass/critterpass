import { useLocalSearchParams } from 'expo-router';

import { PastTripScreen } from '@/features/you/history/past-trip-screen';
import { LocalFirstGate } from '@/features/you/local-first-gate';

/** Add a past trip, or change one (`?id=`), from the stamps list. */
export default function PastTripRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <LocalFirstGate>
      <PastTripScreen {...(typeof id === 'string' && id.length > 0 ? { id } : {})} />
    </LocalFirstGate>
  );
}
