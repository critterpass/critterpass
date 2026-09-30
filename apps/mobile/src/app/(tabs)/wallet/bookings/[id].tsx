import { useLocalSearchParams } from 'expo-router';

import { BookingDetailScreen } from '@/features/bookings/detail/BookingDetailScreen';

/** One booking in full. */
export default function BookingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BookingDetailScreen bookingId={id} />;
}
