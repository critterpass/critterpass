import { Stack } from 'expo-router/js-stack';
import { useMemo } from 'react';

import { deviceMoneyServices } from '@/features/money/data/device-services';
import { MoneyServicesProvider } from '@/features/money/data/services';
import { registerMoneyScreens } from '@/features/money/routes';
import { pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { SessionGate } from '@/ui/states/SessionGate';
import { FULL_SCREEN_ROUTE_OPTIONS, PremiumStack, PremiumStackScreen } from '@/ui/premium/shell';
import { useTheme } from '@/ui/theme';

import { getOcr } from '../../../modules/cp-ocr';

registerMoneyScreens();

/**
 * Money's pushed screens (over the tabs): add, scan, settle up, history and the details. The
 * premium UI uses the native stack, so its pages get the native header and edge swipe.
 */
export default function MoneyLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const services = useMemo(() => deviceMoneyServices(getOcr()), []);
  const premium = usePremiumUi();
  return (
    <MoneyServicesProvider services={services}>
      <SessionGate>
        {premium ? (
          <PremiumStack>
            <PremiumStackScreen name="add" options={FULL_SCREEN_ROUTE_OPTIONS} />
            <PremiumStackScreen name="scan" options={FULL_SCREEN_ROUTE_OPTIONS} />
          </PremiumStack>
        ) : (
          <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
        )}
      </SessionGate>
    </MoneyServicesProvider>
  );
}
