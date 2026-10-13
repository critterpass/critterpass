import { useLocalSearchParams } from 'expo-router';

import { SupplierBookPremium } from '@/features/bookings/premium/supplier/supplier-sheets';

function SupplierRoute() {
  return <SupplierBookPremium params={useLocalSearchParams()} />;
}

/** Booking a Viator activity in the app: hold, traveller, Viator's payment form, result. */
export default SupplierRoute;
