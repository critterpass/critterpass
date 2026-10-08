import { useLocalSearchParams } from 'expo-router';

import { SupplierCancelSheet } from '@/features/bookings/supplier/sheets';

/** Cancelling a Viator booking: Viator's refund quote first, then the cancel. */
export default function SupplierCancelRoute() {
  return <SupplierCancelSheet params={useLocalSearchParams()} />;
}
