import { Stack } from 'expo-router/js-stack';
import { useMemo } from 'react';

import { deviceMoneyServices } from '@/features/money/data/device-services';
import { MoneyServicesProvider } from '@/features/money/data/services';
import { registerMoneyScreens } from '@/features/money/routes';
import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui/theme';

import { getOcr } from '../../../modules/cp-ocr';

registerMoneyScreens();

/** Money's pushed screens (over the tabs): add, scan, settle up, history and the details. */
export default function MoneyLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const services = useMemo(() => deviceMoneyServices(getOcr()), []);
  return (
    <MoneyServicesProvider services={services}>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
    </MoneyServicesProvider>
  );
}
