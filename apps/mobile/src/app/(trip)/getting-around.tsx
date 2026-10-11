import { useLocalSearchParams } from 'expo-router';

import { GettingAroundScreen } from '@/features/bookings/getting-around/GettingAroundScreen';
import { GettingAroundPremium } from '@/features/bookings/premium/GettingAroundPremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** Getting around (3h-3, 5.24): the next leg, a ride, the phrase card and today's later legs. */
export default function GettingAroundRoute() {
  const params = useLocalSearchParams<{ tripId?: string; to?: string; from?: string }>();
  const premium = usePremiumUi();
  const ask = {
    ...(params.tripId ? { tripId: params.tripId } : {}),
    ...(params.to ? { to: params.to } : {}),
    ...(params.from ? { from: params.from } : {}),
  };
  return premium ? <GettingAroundPremium ask={ask} /> : <GettingAroundScreen ask={ask} />;
}
