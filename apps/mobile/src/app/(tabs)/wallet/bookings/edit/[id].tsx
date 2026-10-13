import { useLocalSearchParams } from 'expo-router';

import { BookingFormPremium } from '@/features/bookings/premium/BookingFormPremium';

/** Correct a booking, or (`new`) add one by hand (7.04). */
export default function EditBookingRoute() {
  const { id, kind, title, candidate } = useLocalSearchParams<{
    id: string;
    kind?: string;
    title?: string;
    candidate?: string;
  }>();
  return <BookingFormPremium bookingId={id} kind={kind} title={title} candidateId={candidate} />;
}
