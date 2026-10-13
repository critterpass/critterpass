import { useLocalSearchParams } from 'expo-router';

import { GettingThereScreen } from '@/features/setup/premium/getting-there/getting-there-screen';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId;
}

/** How everyone gets there (4.18). */
export default function GettingThereRoute() {
  return <GettingThereScreen tripId={useTripId()} />;
}
