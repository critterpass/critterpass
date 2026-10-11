import { useLocalSearchParams } from 'expo-router';

import { ForecastScreen } from '@/features/trip/disruptions/forecast/screen';
import { ForecastPremium } from '@/features/trip/premium/day-change/ForecastPremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** The forecast and what could change the plan (3k-7, 6.06). */
export default function ForecastRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const premium = usePremiumUi();
  return premium ? <ForecastPremium tripId={tripId} /> : <ForecastScreen tripId={tripId} />;
}
