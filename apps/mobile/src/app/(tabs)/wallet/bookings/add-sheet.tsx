import { Redirect } from 'expo-router';

import { AddBookingSheet } from '@/features/bookings/premium/AddBookingSheet';
import { BOOKINGS_ROUTES } from '@/features/bookings/routes';
import { premiumRoute } from '@/lib/premium-ui';

/** The current UI has no `+` sheet: its add screen stands in for it. */
function CurrentAddRoute() {
  return <Redirect href={BOOKINGS_ROUTES.add} />;
}

/** "Add a booking" (1.06): the sheet the wallet's `+` grows into. */
export default premiumRoute({ premium: AddBookingSheet, legacy: CurrentAddRoute });
