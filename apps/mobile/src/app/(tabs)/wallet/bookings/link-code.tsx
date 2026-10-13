import { Redirect } from 'expo-router';

import { LinkCodeSheetPremium } from '@/features/bookings/premium/LinkCodeSheetPremium';
import { BOOKINGS_ROUTES } from '@/features/bookings/routes';
import { premiumRoute } from '@/lib/premium-ui';

/** The current UI draws this sheet on its add screen. */
function CurrentRoute() {
  return <Redirect href={{ pathname: BOOKINGS_ROUTES.add, params: { start: 'link' } }} />;
}

/** Got a code? Link your email: a native form sheet over the page that opened it. */
export default premiumRoute({ premium: LinkCodeSheetPremium, legacy: CurrentRoute });
