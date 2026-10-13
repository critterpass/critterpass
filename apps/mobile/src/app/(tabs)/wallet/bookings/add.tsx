import { useLocalSearchParams } from 'expo-router';

import { AddBookingPremium } from '@/features/bookings/premium/AddBookingPremium';

/** Add a booking (3h-2, 7.03); `start` opens scan, paste or the mailbox sheet at once. */
export default function AddBookingRoute() {
  const { start } = useLocalSearchParams<{ start?: string }>();
  return <AddBookingPremium start={start} />;
}
