import { useLocalSearchParams } from 'expo-router';

import { DetailScreen } from '@/features/drivers/directory/DetailScreen';

/** A listed driver (6e-2): `/{tripId}/drivers/directory/{listingId}`. */
export default function DriverDetailRoute() {
  const { tripId, listingId } = useLocalSearchParams<{ tripId: string; listingId: string }>();
  return <DetailScreen tripId={tripId ?? ''} listingId={listingId ?? ''} />;
}
