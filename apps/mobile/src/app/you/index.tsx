import { Redirect, useLocalSearchParams } from 'expo-router';

import { ProfileScreen } from '@/features/you/profile/profile-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** The profile (3n-1). */
function LegacyProfileRoute() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  return <ProfileScreen from={from === 'pass' ? 'pass' : 'home'} />;
}

/** The premium UI keeps the profile in one place: the Pass tab. */
function PassTabRedirect() {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, not copy.
  return <Redirect href="/pass" />;
}

export default premiumRoute({ premium: PassTabRedirect, legacy: LegacyProfileRoute });
