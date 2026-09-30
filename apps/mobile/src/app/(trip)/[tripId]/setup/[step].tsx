import { useLocalSearchParams } from 'expo-router';

import { SetupScreen } from '@/features/setup/shell/setup-screen';
import { stepFromSlug } from '@/features/setup/shell/steps';

/** One setup step (`/{tripId}/setup/when|budget|rooms|must-dos`). */
export default function SetupStepRoute() {
  const { tripId, step } = useLocalSearchParams<{ tripId: string; step: string }>();
  return <SetupScreen tripId={tripId} step={stepFromSlug(step)} />;
}
