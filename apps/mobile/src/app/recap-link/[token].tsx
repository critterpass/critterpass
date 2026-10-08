import { useLocalSearchParams } from 'expo-router';

import { RecapLinkScreen } from '@/features/recap/link/recap-link-screen';
import { RouteMissing } from '@/features/recap/route-missing';

/**
 * A recap link (`/rc/{token}`) followed with the app installed: a traveller's own recap, or the
 * public-safe recap for anyone else.
 */
export default function RecapLinkRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return typeof token === 'string' && token.length > 0 ? (
    <RecapLinkScreen token={token} />
  ) : (
    <RouteMissing testID="recap-link-missing" />
  );
}
