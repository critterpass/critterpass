import { useLocalSearchParams } from 'expo-router';

import { LogRideSheetPremium } from '@/features/bookings/premium/supplier/supplier-sheets';

function SupplierRoute() {
  return <LogRideSheetPremium params={useLocalSearchParams()} />;
}

/** LOG IT: the ride on its leg and, with an amount, a split crew expense. */
export default SupplierRoute;
