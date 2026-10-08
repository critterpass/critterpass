import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { BoardingPassScreen } from '@/features/bookings/boarding-pass/BoardingPassScreen';
import { deviceBookingsServices } from '@/features/bookings/data/device-services';
import { BookingsServicesProvider } from '@/features/bookings/data/services';

import { getOcr } from '../../../../../modules/cp-ocr';

/** The boarding pass or voucher, risen full screen over the tab bar. */
export default function BoardingPassRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const services = useMemo(() => deviceBookingsServices(getOcr()), []);
  return (
    <BookingsServicesProvider services={services}>
      <BoardingPassScreen bookingId={id} />
    </BookingsServicesProvider>
  );
}
