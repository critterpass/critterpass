import { Redirect } from 'expo-router';

import { PasteSheetPremium } from '@/features/bookings/premium/PasteSheetPremium';
import { BOOKINGS_ROUTES } from '@/features/bookings/routes';
import { premiumRoute } from '@/lib/premium-ui';

/** The current UI draws this sheet on its add screen. */
function CurrentRoute() {
  return <Redirect href={{ pathname: BOOKINGS_ROUTES.add, params: { start: 'paste' } }} />;
}

/** Paste a booking (7.03's Paste tile): a native form sheet over the page that opened it. */
export default premiumRoute({ premium: PasteSheetPremium, legacy: CurrentRoute });
