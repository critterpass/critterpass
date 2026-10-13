import { useLocalSearchParams } from 'expo-router';

import { EstimateWhySheetPremium } from '@/features/bookings/premium/supplier/supplier-sheets';

function SupplierRoute() {
  return <EstimateWhySheetPremium params={useLocalSearchParams()} />;
}

/** Why a fare estimate says what it says: basis, sources, when checked, whether reviewed. */
export default SupplierRoute;
