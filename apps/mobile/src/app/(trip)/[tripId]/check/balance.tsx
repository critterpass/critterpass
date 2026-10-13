import { useLocalSearchParams } from 'expo-router';

import { BalanceScreen } from '@/features/plan/check';
import { PremiumBalanceView } from '@/features/plan/premium/check/balance-gap';

/** Balance the crew (7h-5), organisers only: `/{tripId}/check/balance`. */
export default function BalanceRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <BalanceScreen tripId={tripId ?? ''} View={PremiumBalanceView} />;
}
