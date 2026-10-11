import { useLocalSearchParams } from 'expo-router';

import { SetupChecklistScreen } from '@/features/setup/premium/checklist/setup-checklist-screen';
import { SetupScreen } from '@/features/setup/shell/setup-screen';
import { premiumRoute } from '@/lib/premium-ui';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId;
}

/** Trip setup at the step it is on (`/{tripId}/setup`). */
function CurrentSetupRoute() {
  return <SetupScreen tripId={useTripId()} step={null} />;
}

/** Setup together (4.08, 4.09): the checklist, in any order once the dates are locked. */
function PremiumSetupRoute() {
  return <SetupChecklistScreen tripId={useTripId()} />;
}

export default premiumRoute({ premium: PremiumSetupRoute, legacy: CurrentSetupRoute });
