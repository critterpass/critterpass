import { useLocalSearchParams } from 'expo-router';

import { BalanceScreen } from '@/features/plan/check';

/** Balance the crew (7h-5), organisers only: `/{tripId}/check/balance`. */
export default function BalanceRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <BalanceScreen tripId={tripId ?? ''} />;
}
