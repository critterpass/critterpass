import { useLocalSearchParams } from 'expo-router';

import { VendorDraftSheetPremium } from '@/features/bookings/premium/supplier/supplier-sheets';

function SupplierRoute() {
  return <VendorDraftSheetPremium params={useLocalSearchParams()} />;
}

/** A message to a place: the exact text, then the desk sends it or the traveller's WhatsApp does. */
export default SupplierRoute;
