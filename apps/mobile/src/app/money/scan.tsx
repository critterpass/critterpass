import { useLocalSearchParams } from 'expo-router';

import { premiumScanPanel } from '@/features/money/premium/receipt/ScanPanels';
import { ScanScreen } from '@/features/money/receipt/ScanScreen';
import { tripParam } from '@/features/money/routes';
import { usePremiumUi } from '@/lib/premium-ui';

/** Scan a receipt (3i-3, 7.19, 7.20) and its three ways forward when it can't be read (3i-4). */
export default function ScanRoute() {
  const { trip, tripId } = useLocalSearchParams<{ trip?: string; tripId?: string }>();
  const premium = usePremiumUi();
  return (
    <ScanScreen
      tripId={tripParam(trip, tripId)}
      {...(premium ? { panelFor: premiumScanPanel } : {})}
    />
  );
}
