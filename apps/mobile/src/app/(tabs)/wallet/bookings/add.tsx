import { useLocalSearchParams } from 'expo-router';

import { AddBookingScreen } from '@/features/bookings/add/AddBookingScreen';
import { AddBookingPremium } from '@/features/bookings/premium/AddBookingPremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** Add a booking (3h-2, 7.03); `start` opens scan, paste or the mailbox sheet at once. */
export default function AddBookingRoute() {
  const { start } = useLocalSearchParams<{ start?: string }>();
  const premium = usePremiumUi();
  return premium ? <AddBookingPremium start={start} /> : <AddBookingScreen start={start} />;
}
