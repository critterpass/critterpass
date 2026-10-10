/* eslint-disable lingui/no-unlocalized-strings -- route names, not copy. */
import { Stack } from 'expo-router/js-stack';
import { useMemo } from 'react';

import { registerBookingsScreens } from '@/features/bookings/routes';
import { WALLET_HALF_OPTIONS } from '@/features/bookings/stack/wallet-halves';
import { deviceMoneyServices } from '@/features/money/data/device-services';
import { MoneyServicesProvider } from '@/features/money/data/services';
import { registerMoneyScreens } from '@/features/money/routes';
import { pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { useTheme } from '@/ui/theme';

import { getOcr } from '../../../../modules/cp-ocr';

registerMoneyScreens();
registerBookingsScreens();

/** The halves swap in place in the premium stack too. */
const PREMIUM_HALF_OPTIONS = { animation: 'none', gestureEnabled: false } as const;

export const unstable_settings = { initialRouteName: 'money/index' };

/**
 * The WALLET tab: BOOKINGS | MONEY. Money's Balances opens first and the switch swaps the halves in
 * place (no transition, no back swipe); Budget pushes inside the tab (it keeps the tab bar). The bookings half registers its own screens under `bookings/`.
 */
export default function WalletLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const services = useMemo(() => deviceMoneyServices(getOcr()), []);
  const premium = usePremiumUi();
  if (premium) {
    return (
      <MoneyServicesProvider services={services}>
        <PremiumStack>
          <PremiumStackScreen name="money/index" options={PREMIUM_HALF_OPTIONS} />
          <PremiumStackScreen name="bookings" options={PREMIUM_HALF_OPTIONS} />
        </PremiumStack>
      </MoneyServicesProvider>
    );
  }
  return (
    <MoneyServicesProvider services={services}>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
        <Stack.Screen name="money/index" options={WALLET_HALF_OPTIONS} />
        <Stack.Screen name="bookings" options={WALLET_HALF_OPTIONS} />
      </Stack>
    </MoneyServicesProvider>
  );
}
