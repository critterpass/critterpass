import { useLocalSearchParams } from 'expo-router';

import { PREMIUM_STEP_VIEWS } from '@/features/setup/premium/steps/premium-steps';
import { SetupScreen } from '@/features/setup/shell/setup-screen';
import { stepFromSlug } from '@/features/setup/shell/steps';

/**
 * One setup step (`/{tripId}/setup/when|budget|rooms|must-dos`). From the checklist the
 * steps open in any order once the dates are locked.
 */
export default function SetupStepRoute() {
  const { tripId, step } = useLocalSearchParams<{ tripId: string; step: string }>();
  return <SetupScreen tripId={tripId} step={stepFromSlug(step)} views={PREMIUM_STEP_VIEWS} />;
}
