import { router, useLocalSearchParams } from 'expo-router';

import { TRIPS_TAB } from '@/features/trip/hub/routes';
import { TripHubScreen } from '@/features/trip/hub/screen';

/** One trip's hub (3k-1), opened from the trip switcher, a link or Home's trip card. */
export default function TripHubRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  if (typeof tripId !== 'string') return null;
  return (
    <TripHubScreen
      tripId={tripId}
      onSwitch={router.canGoBack() ? () => router.back() : () => router.navigate(TRIPS_TAB)}
    />
  );
}
