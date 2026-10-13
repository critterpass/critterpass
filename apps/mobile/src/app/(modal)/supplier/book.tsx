import { useLocalSearchParams } from 'expo-router';

import { SupplierBookPremium } from '@/features/bookings/premium/supplier/supplier-sheets';
import { SupplierBookSheet } from '@/features/bookings/supplier/sheets';
import { premiumRoute } from '@/lib/premium-ui';

function Premium() {
  return <SupplierBookPremium params={useLocalSearchParams()} />;
}

function Legacy() {
  return <SupplierBookSheet params={useLocalSearchParams()} />;
}

/** Booking a Viator activity in the app: hold, traveller, Viator's payment form, result. */
export default premiumRoute({ premium: Premium, legacy: Legacy });
