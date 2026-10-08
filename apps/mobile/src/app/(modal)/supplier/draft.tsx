import { useLocalSearchParams } from 'expo-router';

import { VendorDraftSheet } from '@/features/bookings/supplier/sheets';

/** A message to a place: the exact text, then the desk sends it or the traveller's WhatsApp does. */
export default function VendorDraftRoute() {
  return <VendorDraftSheet params={useLocalSearchParams()} />;
}
