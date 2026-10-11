import { useLocalSearchParams } from 'expo-router';

import { BookingDetailScreen } from '@/features/bookings/detail/BookingDetailScreen';
import { BookingDetailPremium } from '@/features/bookings/premium/BookingDetailPremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** One booking in full (7.06, 7.10, 7.12). */
export default function BookingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const premium = usePremiumUi();
  return premium ? <BookingDetailPremium bookingId={id} /> : <BookingDetailScreen bookingId={id} />;
}
