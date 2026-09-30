import { useLocalSearchParams } from 'expo-router';

import { SetupScreen } from '@/features/setup/shell/setup-screen';

/** Trip setup at the step it is on (`/{tripId}/setup`). */
export default function SetupRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <SetupScreen tripId={tripId} step={null} />;
}
