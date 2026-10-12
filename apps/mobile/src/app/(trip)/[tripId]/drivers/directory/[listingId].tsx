import { useLocalSearchParams } from 'expo-router';

import { DetailScreen } from '@/features/drivers/directory/DetailScreen';
import { DriverDetailPremium } from '@/features/drivers/premium/DriverDetailPremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** A listed driver (6e-2, 6.20): `/{tripId}/drivers/directory/{listingId}`. */
export default function DriverDetailRoute() {
  const { tripId, listingId } = useLocalSearchParams<{ tripId: string; listingId: string }>();
  const premium = usePremiumUi();
  const props = { tripId: tripId ?? '', listingId: listingId ?? '' };
  return premium ? <DriverDetailPremium {...props} /> : <DetailScreen {...props} />;
}
