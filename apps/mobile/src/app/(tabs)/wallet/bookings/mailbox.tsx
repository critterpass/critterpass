import { Redirect } from 'expo-router';

import { MailboxSheetPremium } from '@/features/bookings/premium/MailboxPremium';
import { BOOKINGS_ROUTES } from '@/features/bookings/routes';
import { premiumRoute } from '@/lib/premium-ui';

/** The current UI draws this sheet on its add screen. */
function CurrentRoute() {
  return <Redirect href={{ pathname: BOOKINGS_ROUTES.add, params: { start: 'mailbox' } }} />;
}

/** Find bookings in my email (7.05): a native form sheet over the page that opened it. */
export default premiumRoute({ premium: MailboxSheetPremium, legacy: CurrentRoute });
