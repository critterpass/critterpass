import { useLocalSearchParams } from 'expo-router';

import { SetupChecklistScreen } from '@/features/setup/premium/checklist/setup-checklist-screen';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId;
}

/** Setup together (4.08, 4.09): the checklist, in any order once the dates are locked. */
export default function SetupRoute() {
  return <SetupChecklistScreen tripId={useTripId()} />;
}
