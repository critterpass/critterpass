import { useLocalSearchParams } from 'expo-router';

import { LogRideRouteSheet } from '@/features/bookings/supplier/sheets';

/** LOG IT: the ride on its leg and, with an amount, a split crew expense. */
export default function LogRideRoute() {
  return <LogRideRouteSheet params={useLocalSearchParams()} />;
}
