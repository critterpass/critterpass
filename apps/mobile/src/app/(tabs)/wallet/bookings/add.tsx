import { useLocalSearchParams } from 'expo-router';

import { AddBookingScreen } from '@/features/bookings/add/AddBookingScreen';

/** Add a booking (3h-2); `start` opens scan, paste or the mailbox sheet at once. */
export default function AddBookingRoute() {
  const { start } = useLocalSearchParams<{ start?: string }>();
  return <AddBookingScreen start={start} />;
}
