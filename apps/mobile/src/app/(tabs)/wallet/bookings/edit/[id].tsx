import { useLocalSearchParams } from 'expo-router';

import { BookingFormScreen } from '@/features/bookings/detail/BookingFormScreen';
import { BookingFormPremium } from '@/features/bookings/premium/BookingFormPremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** Correct a booking, or (`new`) add one by hand (7.04). */
export default function EditBookingRoute() {
  const { id, kind, title, candidate } = useLocalSearchParams<{
    id: string;
    kind?: string;
    title?: string;
    candidate?: string;
  }>();
  const premium = usePremiumUi();
  return premium ? (
    <BookingFormPremium bookingId={id} kind={kind} title={title} candidateId={candidate} />
  ) : (
    <BookingFormScreen bookingId={id} kind={kind} title={title} candidateId={candidate} />
  );
}
