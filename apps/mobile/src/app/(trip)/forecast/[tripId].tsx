import { useLocalSearchParams } from 'expo-router';

import { ForecastScreen } from '@/features/trip/disruptions/forecast/screen';

/** The forecast and what could change the plan (3k-7). */
export default function ForecastRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <ForecastScreen tripId={tripId} />;
}
