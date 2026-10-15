import { useLocalSearchParams } from 'expo-router';

import { BookingDetailPremium } from '@/features/bookings/premium/BookingDetailPremium';

/** One booking in full (7.06, 7.10, 7.12). */
export default function BookingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BookingDetailPremium bookingId={id} />;
}
