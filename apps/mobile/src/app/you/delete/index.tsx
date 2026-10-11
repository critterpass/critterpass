import { Stack } from 'expo-router/js-stack';

import { DeleteScreen } from '@/features/you/account/delete-screen';
import { DeletePremiumScreen } from '@/features/you/premium/delete/delete-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** Delete account (3n-9, 3n-10) and, once closed, the last page (3n-11). */
function LegacyDeleteRoute() {
  return <DeleteScreen whenClosed={<Stack.Screen options={{ gestureEnabled: false }} />} />;
}

/** Premium: one page with the hold to delete (9.09). */
export default premiumRoute({ premium: DeletePremiumScreen, legacy: LegacyDeleteRoute });
