import { useLocalSearchParams } from 'expo-router';

import { PremiumRecapLinkScreen } from '@/features/recap/premium/recap-link-screen';
import { PremiumRouteMissing } from '@/features/album';

/**
 * A recap link (`/rc/{token}`) followed with the app installed: a traveller's own recap, or the
 * public-safe recap for anyone else.
 */
export default function RecapLinkRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  if (typeof token !== 'string' || token.length === 0) {
    return <PremiumRouteMissing testID="recap-link-missing" />;
  }
  return <PremiumRecapLinkScreen token={token} />;
}
