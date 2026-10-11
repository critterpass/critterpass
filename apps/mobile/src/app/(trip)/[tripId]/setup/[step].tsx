import { useLocalSearchParams } from 'expo-router';

import { SetupScreen } from '@/features/setup/shell/setup-screen';
import { stepFromSlug } from '@/features/setup/shell/steps';
import { usePremiumUi } from '@/lib/premium-ui';

/**
 * One setup step (`/{tripId}/setup/when|budget|rooms|must-dos`). From the premium checklist the
 * steps open in any order once the dates are locked.
 */
export default function SetupStepRoute() {
  const { tripId, step } = useLocalSearchParams<{ tripId: string; step: string }>();
  const premium = usePremiumUi();
  return <SetupScreen tripId={tripId} step={stepFromSlug(step)} anyOrder={premium} />;
}
