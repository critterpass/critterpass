import { useLocalSearchParams } from 'expo-router';

import { CheckScreen } from '@/features/plan/check';
import { PremiumAskCard } from '@/features/plan/premium/check/ask-card';
import { PremiumCheckView } from '@/features/plan/premium/check/check-view';

/** The plan check (7h-1): `/{tripId}/check`. */
export default function CheckRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <CheckScreen tripId={tripId ?? ''} View={PremiumCheckView} Ask={PremiumAskCard} />;
}
