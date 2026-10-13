import { useLocalSearchParams } from 'expo-router';

import { VendorDraftSheetPremium } from '@/features/bookings/premium/supplier/supplier-sheets';
import { VendorDraftSheet } from '@/features/bookings/supplier/sheets';
import { premiumRoute } from '@/lib/premium-ui';

function Premium() {
  return <VendorDraftSheetPremium params={useLocalSearchParams()} />;
}

function Legacy() {
  return <VendorDraftSheet params={useLocalSearchParams()} />;
}

/** A message to a place: the exact text, then the desk sends it or the traveller's WhatsApp does. */
export default premiumRoute({ premium: Premium, legacy: Legacy });
