import { useLocalSearchParams } from 'expo-router';

import { SupplierCancelPremium } from '@/features/bookings/premium/supplier/supplier-sheets';

function SupplierRoute() {
  return <SupplierCancelPremium params={useLocalSearchParams()} />;
}

/** Cancelling a Viator booking: Viator's refund quote first, then the cancel. */
export default SupplierRoute;
