import { useLocalSearchParams } from 'expo-router';

import { ScanScreen } from '@/features/money/receipt/ScanScreen';
import { tripParam } from '@/features/money/routes';

/** Scan a receipt (3i-3, 7.19, 7.20) and its three ways forward when it can't be read (3i-4). */
export default function ScanRoute() {
  const { trip, tripId } = useLocalSearchParams<{ trip?: string; tripId?: string }>();
  return <ScanScreen tripId={tripParam(trip, tripId)} />;
}
