import { Stack } from 'expo-router/js-stack';
import { useMemo } from 'react';

import { deviceTripDayServices } from '@/features/trip/bundle/device-services';
import { TripDayServicesProvider } from '@/features/trip/bundle/services';
import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui/theme';

/** The trip day pages over the tabs: the offline card (3k-4) and Settings > Offline storage. */
export default function TripDayPagesLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const services = useMemo(() => deviceTripDayServices(), []);
  return (
    <TripDayServicesProvider services={services}>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
    </TripDayServicesProvider>
  );
}
