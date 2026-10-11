import { useLocalSearchParams } from 'expo-router';

import { PrivateToursPremium } from '@/features/drivers/premium/PrivateToursPremium';
import { PrivateToursScreen } from '@/features/drivers/private-tours/PrivateToursScreen';
import { usePremiumUi } from '@/lib/premium-ui';

/** Private cars with a driver from Klook and Viator (6f-1, 6.21): `/{tripId}/drivers/tours?days=`. */
export default function PrivateToursRoute() {
  const { tripId, days } = useLocalSearchParams<{ tripId: string; days?: string }>();
  const premium = usePremiumUi();
  const props = { tripId: tripId ?? '', ...(days ? { days } : {}) };
  return premium ? <PrivateToursPremium {...props} /> : <PrivateToursScreen {...props} />;
}
