import { useLocalSearchParams } from 'expo-router';

import { PremiumRecapScene } from '@/features/recap/premium/recap-scene';
import { PremiumRecapShare } from '@/features/recap/premium/recap-share';
import { RecapSummaryScreen } from '@/features/recap/summary/summary-screen';
import { RouteMissing } from '@/features/recap/route-missing';

/** The trip's recap page (3m-1), also where the recap-ready push lands (`/recap/<tripId>`). */
export default function RecapRoute() {
  const { tripId, ended } = useLocalSearchParams<{ tripId: string; ended?: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? (
    <RecapSummaryScreen
      tripId={tripId}
      ended={ended === '1'}
      View={PremiumRecapScene}
      Share={PremiumRecapShare}
    />
  ) : (
    <RouteMissing testID="recap-missing" />
  );
}
