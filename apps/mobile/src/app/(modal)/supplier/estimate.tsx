import { useLocalSearchParams } from 'expo-router';

import { EstimateWhySheet } from '@/features/bookings/supplier/sheets';

/** Why a fare estimate says what it says: basis, sources, when checked, whether reviewed. */
export default function EstimateRoute() {
  return <EstimateWhySheet params={useLocalSearchParams()} />;
}
