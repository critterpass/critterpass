import { useLocalSearchParams } from 'expo-router';

import { SupplierCancelPremium } from '@/features/bookings/premium/supplier/supplier-sheets';
import { SupplierCancelSheet } from '@/features/bookings/supplier/sheets';
import { premiumRoute } from '@/lib/premium-ui';

function Premium() {
  return <SupplierCancelPremium params={useLocalSearchParams()} />;
}

function Legacy() {
  return <SupplierCancelSheet params={useLocalSearchParams()} />;
}

/** Cancelling a Viator booking: Viator's refund quote first, then the cancel. */
export default premiumRoute({ premium: Premium, legacy: Legacy });
