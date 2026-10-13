import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { deviceBookingsServices } from '@/features/bookings/data/device-services';
import { BookingsServicesProvider } from '@/features/bookings/data/services';
import { BoardingPassPremium } from '@/features/bookings/premium/BoardingPassPremium';

import { getOcr } from '../../../../../modules/cp-ocr';

/** The boarding pass or voucher, full screen over the tab bar (7.11). */
export default function BoardingPassRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const services = useMemo(() => deviceBookingsServices(getOcr()), []);
  return (
    <BookingsServicesProvider services={services}>
      <BoardingPassPremium bookingId={id} />
    </BookingsServicesProvider>
  );
}
