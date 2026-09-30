/* eslint-disable lingui/no-unlocalized-strings -- route names, not copy. */
import { Stack } from 'expo-router/js-stack';
import { useMemo } from 'react';

import { registerBookingsScreens } from '@/features/bookings/routes';
import { WALLET_HALF_OPTIONS } from '@/features/bookings/stack/wallet-halves';
import { deviceMoneyServices } from '@/features/money/data/device-services';
import { MoneyServicesProvider } from '@/features/money/data/services';
import { registerMoneyScreens } from '@/features/money/routes';
import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui/theme';

import { getOcr } from '../../../../modules/cp-ocr';

registerMoneyScreens();
registerBookingsScreens();

export const unstable_settings = { initialRouteName: 'money/index' };

/**
 * The WALLET tab: BOOKINGS | MONEY. Money's Balances opens first and the switch swaps the halves in
 * place (no transition, no back swipe); Budget pushes inside the tab (it keeps the tab bar). The bookings half registers its own screens under `bookings/`.
 */
export default function WalletLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const services = useMemo(() => deviceMoneyServices(getOcr()), []);
  return (
    <MoneyServicesProvider services={services}>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
        <Stack.Screen name="money/index" options={WALLET_HALF_OPTIONS} />
        <Stack.Screen name="bookings" options={WALLET_HALF_OPTIONS} />
      </Stack>
    </MoneyServicesProvider>
  );
}
