import { Stack } from 'expo-router/js-stack';
import { useMemo } from 'react';

import { BookingsServicesProvider } from '@/features/bookings/data/services';
import { deviceBookingsServices } from '@/features/bookings/data/device-services';
import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui/theme';

import { getOcr } from '../../../../../modules/cp-ocr';

/**
 * The BOOKINGS half of the Wallet tab: the stack, a booking, adding one and the archive push
 * inside the tab (they keep the tab bar); the boarding pass covers it full screen.
 */
export default function BookingsLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const services = useMemo(() => deviceBookingsServices(getOcr()), []);
  return (
    <BookingsServicesProvider services={services}>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
    </BookingsServicesProvider>
  );
}
