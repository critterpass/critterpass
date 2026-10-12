import { useLocalSearchParams } from 'expo-router';

import { BalanceScreen } from '@/features/plan/check';
import { PremiumBalanceView } from '@/features/plan/premium/check/balance-gap';
import { usePremiumUi } from '@/lib/premium-ui';

/** Balance the crew (7h-5), organisers only: `/{tripId}/check/balance`. */
export default function BalanceRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const premium = usePremiumUi();
  return <BalanceScreen tripId={tripId ?? ''} {...(premium ? { View: PremiumBalanceView } : {})} />;
}
