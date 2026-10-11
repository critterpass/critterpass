import { useLocalSearchParams } from 'expo-router';

import { CheckScreen } from '@/features/plan/check';
import { PremiumAskCard } from '@/features/plan/premium/check/ask-card';
import { PremiumCheckView } from '@/features/plan/premium/check/check-view';
import { usePremiumUi } from '@/lib/premium-ui';

/** The plan check (7h-1): `/{tripId}/check`. */
export default function CheckRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const premium = usePremiumUi();
  return (
    <CheckScreen
      tripId={tripId ?? ''}
      {...(premium ? { View: PremiumCheckView, Ask: PremiumAskCard } : {})}
    />
  );
}
