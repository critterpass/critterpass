import { useLocalSearchParams } from 'expo-router';

import { RecapLinkScreen } from '@/features/recap/link/recap-link-screen';
import { PremiumRecapLinkScreen } from '@/features/recap/premium/recap-link-screen';
import { RouteMissing } from '@/features/recap/route-missing';
import { usePremiumUi } from '@/lib/premium-ui';

/**
 * A recap link (`/rc/{token}`) followed with the app installed: a traveller's own recap, or the
 * public-safe recap for anyone else.
 */
export default function RecapLinkRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const premium = usePremiumUi();
  if (typeof token !== 'string' || token.length === 0) {
    return <RouteMissing testID="recap-link-missing" />;
  }
  return premium ? <PremiumRecapLinkScreen token={token} /> : <RecapLinkScreen token={token} />;
}
