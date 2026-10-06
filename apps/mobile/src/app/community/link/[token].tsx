import { useLocalSearchParams } from 'expo-router';

import { PlanLinkScreen } from '@/features/community/link/plan-link-screen';

/** A plan link (`/p/{token}`) followed with the app installed: its plan, as a shared plan (3o-2). */
export default function PlanLinkRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return typeof token === 'string' && token.length > 0 ? <PlanLinkScreen token={token} /> : null;
}
