import { useLocalSearchParams } from 'expo-router';

import { ChangeDatesScreen } from '@/features/plan/premium/settings/change-dates-screen';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId;
}

/** Change dates with what it changes (4.54). */
export default function Route() {
  return <ChangeDatesScreen tripId={useTripId()} />;
}
