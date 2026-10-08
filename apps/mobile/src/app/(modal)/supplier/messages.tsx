import { useLocalSearchParams } from 'expo-router';

import { VendorMessagesSheet } from '@/features/bookings/supplier/sheets';

/** The trip's messages to places: drafts to send, sent and waiting, and the places' replies. */
export default function VendorMessagesRoute() {
  return <VendorMessagesSheet params={useLocalSearchParams()} />;
}
