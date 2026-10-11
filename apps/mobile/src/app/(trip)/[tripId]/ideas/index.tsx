import { useLocalSearchParams } from 'expo-router';

import { IdeasScreen } from '@/features/plan/ideas';
import { IdeasSheet } from '@/features/plan/premium/ideas/ideas-sheet';
import { premiumRoute } from '@/lib/premium-ui';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId ?? '';
}

/** Ideas (7f-2): `/{tripId}/ideas`. */
function CurrentIdeasRoute() {
  return <IdeasScreen tripId={useTripId()} />;
}

/** Ideas as a sheet over the plan map (4.40), with must-do stars. */
function PremiumIdeasRoute() {
  return <IdeasSheet tripId={useTripId()} />;
}

export default premiumRoute({ premium: PremiumIdeasRoute, legacy: CurrentIdeasRoute });
