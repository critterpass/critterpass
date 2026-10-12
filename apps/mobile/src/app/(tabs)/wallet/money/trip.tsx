import { Redirect } from 'expo-router';

import { TripSheetScreen } from '@/features/money/premium/MoneySheets';
import { MONEY_ROUTES } from '@/features/money/routes';
import { premiumRoute } from '@/lib/premium-ui';

/** The current UI opens this from Balances itself: the link lands on Balances. */
function CurrentRoute() {
  return <Redirect href={MONEY_ROUTES.balances} />;
}

export default premiumRoute({ premium: TripSheetScreen, legacy: CurrentRoute });
