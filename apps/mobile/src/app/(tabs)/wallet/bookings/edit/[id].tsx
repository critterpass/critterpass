import { useLocalSearchParams } from 'expo-router';

import { BookingFormScreen } from '@/features/bookings/detail/BookingFormScreen';

/** Correct a booking, or (`new`) add one by hand. */
export default function EditBookingRoute() {
  const { id, kind, title, candidate } = useLocalSearchParams<{
    id: string;
    kind?: string;
    title?: string;
    candidate?: string;
  }>();
  return <BookingFormScreen bookingId={id} kind={kind} title={title} candidateId={candidate} />;
}
