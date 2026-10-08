import { useLocalSearchParams } from 'expo-router';

import { SupplierBookSheet } from '@/features/bookings/supplier/sheets';

/** Booking a Viator activity in the app: hold, traveller, Viator's payment form, result. */
export default function SupplierBookRoute() {
  return <SupplierBookSheet params={useLocalSearchParams()} />;
}
