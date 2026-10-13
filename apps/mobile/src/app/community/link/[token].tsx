import { useLocalSearchParams } from 'expo-router';

import { PlanLinkPremiumScreen } from '@/features/community/premium/plan-link-premium-screen';

/** A plan link (`/p/{token}`) followed with the app installed: its plan, as a shared plan (3o-2). */
export default function PlanLinkRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return typeof token === 'string' && token.length > 0 ? (
    <PlanLinkPremiumScreen token={token} />
  ) : null;
}
