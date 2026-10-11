import { Redirect } from 'expo-router';

import { AppearanceSheet } from '@/features/you/premium/edit/appearance-sheet';
import { premiumRoute } from '@/lib/premium-ui';

/** The current UI has no appearance setting: the page it is set from is the profile. */
function LegacyRedirect() {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, not copy.
  return <Redirect href="/you/edit" />;
}

/** Appearance (9.02): follows the phone, light or dark. */
export default premiumRoute({ premium: AppearanceSheet, legacy: LegacyRedirect });
