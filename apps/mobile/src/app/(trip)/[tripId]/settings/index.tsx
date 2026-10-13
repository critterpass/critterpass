import { useLocalSearchParams } from 'expo-router';

import { TripSettingsScreen } from '@/features/plan/premium/settings/trip-settings-screen';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId;
}

/** Trip settings (4.53), from the plan's more menu. */
export default function Route() {
  return <TripSettingsScreen tripId={useTripId()} />;
}
