import { useLocalSearchParams } from 'expo-router';

import { ForecastPremium } from '@/features/trip/premium/day-change/ForecastPremium';

/** The forecast and what could change the plan (3k-7, 6.06). */
export default function ForecastRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <ForecastPremium tripId={tripId} />;
}
