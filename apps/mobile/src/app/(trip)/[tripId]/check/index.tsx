import { useLocalSearchParams } from 'expo-router';

import { CheckScreen } from '@/features/plan/check';

/** The plan check (7h-1): `/{tripId}/check`. */
export default function CheckRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <CheckScreen tripId={tripId ?? ''} />;
}
