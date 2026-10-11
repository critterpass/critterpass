import { useLocalSearchParams } from 'expo-router';

import { OfflineScreen } from '@/features/trip/offline/offline-screen';
import { OfflinePremium } from '@/features/trip/premium/offline/OfflinePremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** The trip's offline page (3k-4, 6.15): what works with no signal and what will send. */
export default function TripOfflineRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const premium = usePremiumUi();
  if (typeof tripId !== 'string') return null;
  return premium ? <OfflinePremium tripId={tripId} /> : <OfflineScreen tripId={tripId} />;
}
