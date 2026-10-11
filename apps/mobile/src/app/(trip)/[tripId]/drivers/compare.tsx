import { useLocalSearchParams } from 'expo-router';

import { CompareScreen } from '@/features/drivers/compare/CompareScreen';
import { ComparePremium } from '@/features/drivers/premium/ComparePremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** Compare the shortlist (6d-1, 6.23): `/{tripId}/drivers/compare?days=`. */
export default function CompareRoute() {
  const { tripId, days } = useLocalSearchParams<{ tripId: string; days?: string }>();
  const premium = usePremiumUi();
  const props = { tripId: tripId ?? '', ...(days ? { days } : {}) };
  return premium ? <ComparePremium {...props} /> : <CompareScreen {...props} />;
}
