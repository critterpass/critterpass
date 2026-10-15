import { useLocalSearchParams } from 'expo-router';

import { VendorMessagesSheetPremium } from '@/features/bookings/premium/supplier/supplier-sheets';

function SupplierRoute() {
  return <VendorMessagesSheetPremium params={useLocalSearchParams()} />;
}

/** The trip's messages to places: drafts to send, sent and waiting, and the places' replies. */
export default SupplierRoute;
