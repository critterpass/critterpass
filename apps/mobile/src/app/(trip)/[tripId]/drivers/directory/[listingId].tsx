import { useLocalSearchParams } from 'expo-router';

import { DriverDetailPremium } from '@/features/drivers/premium/DriverDetailPremium';

/** A listed driver (6e-2, 6.20): `/{tripId}/drivers/directory/{listingId}`. */
export default function DriverDetailRoute() {
  const { tripId, listingId } = useLocalSearchParams<{ tripId: string; listingId: string }>();
  const props = { tripId: tripId ?? '', listingId: listingId ?? '' };
  return <DriverDetailPremium {...props} />;
}
