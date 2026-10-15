import { useLocalSearchParams } from 'expo-router';

import { OfflinePremium } from '@/features/trip/premium/offline/OfflinePremium';

/** The trip's offline page (3k-4, 6.15): what works with no signal and what will send. */
export default function TripOfflineRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  if (typeof tripId !== 'string') return null;
  return <OfflinePremium tripId={tripId} />;
}
