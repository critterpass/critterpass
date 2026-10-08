import { useLocalSearchParams } from 'expo-router';

import { ScanScreen } from '@/features/money/receipt/ScanScreen';
import { tripParam } from '@/features/money/routes';

/** Scan a receipt (3i-3) and its three ways forward when it can't be read (3i-4). */
export default function ScanRoute() {
  const { trip } = useLocalSearchParams<{ trip?: string }>();
  return <ScanScreen tripId={tripParam(trip)} />;
}
