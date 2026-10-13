import { useLocalSearchParams } from 'expo-router';

import { VendorMessagesSheetPremium } from '@/features/bookings/premium/supplier/supplier-sheets';
import { VendorMessagesSheet } from '@/features/bookings/supplier/sheets';
import { premiumRoute } from '@/lib/premium-ui';

function Premium() {
  return <VendorMessagesSheetPremium params={useLocalSearchParams()} />;
}

function Legacy() {
  return <VendorMessagesSheet params={useLocalSearchParams()} />;
}

/** The trip's messages to places: drafts to send, sent and waiting, and the places' replies. */
export default premiumRoute({ premium: Premium, legacy: Legacy });
