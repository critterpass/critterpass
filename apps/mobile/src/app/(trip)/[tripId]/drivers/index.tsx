import { useLocalSearchParams } from 'expo-router';

import { FindDriverScreen } from '@/features/drivers/find/FindDriverScreen';
import { FindDriverPremium } from '@/features/drivers/premium/FindDriverPremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** Find a driver (6a-2, 6.19): `/{tripId}/drivers?days=`. */
export default function FindDriverRoute() {
  const { tripId, days } = useLocalSearchParams<{ tripId: string; days?: string }>();
  const premium = usePremiumUi();
  const props = { tripId: tripId ?? '', ...(days ? { days } : {}) };
  return premium ? <FindDriverPremium {...props} /> : <FindDriverScreen {...props} />;
}
