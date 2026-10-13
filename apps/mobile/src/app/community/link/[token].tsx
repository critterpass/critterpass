import { useLocalSearchParams } from 'expo-router';

import { PlanLinkScreen } from '@/features/community/link/plan-link-screen';
import { PlanLinkPremiumScreen } from '@/features/community/premium/plan-link-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

const PlanLink = premiumRoute({ premium: PlanLinkPremiumScreen, legacy: PlanLinkScreen });

/** A plan link (`/p/{token}`) followed with the app installed: its plan, as a shared plan (3o-2). */
export default function PlanLinkRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return typeof token === 'string' && token.length > 0 ? <PlanLink token={token} /> : null;
}
