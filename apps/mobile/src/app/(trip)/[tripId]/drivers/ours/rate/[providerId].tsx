import { useLocalSearchParams } from 'expo-router';

import { RateDriverPremium } from '@/features/drivers/premium/RateDriverPremium';
import { RateDriverScreen } from '@/features/drivers/rating/RateDriverScreen';
import { usePremiumUi } from '@/lib/premium-ui';

/** Rate your driver (6g-1, 6.24): `/{tripId}/drivers/ours/rate/{providerId}`. */
export default function RateDriverRoute() {
  const { tripId, providerId } = useLocalSearchParams<{ tripId: string; providerId: string }>();
  const premium = usePremiumUi();
  const props = { tripId: tripId ?? '', providerId: providerId ?? '' };
  return premium ? <RateDriverPremium {...props} /> : <RateDriverScreen {...props} />;
}
