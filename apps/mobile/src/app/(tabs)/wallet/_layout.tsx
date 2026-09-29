import { Stack } from 'expo-router/js-stack';

import { registerMoneyScreens } from '@/features/money/routes';
import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui/theme';

registerMoneyScreens();

// eslint-disable-next-line lingui/no-unlocalized-strings -- a route name, not copy
export const unstable_settings = { initialRouteName: 'money/index' };

/**
 * The WALLET tab: BOOKINGS | MONEY. Money's Balances opens first; Budget pushes inside the tab (it
 * keeps the tab bar). The bookings half registers its own screens under `bookings/`.
 */
export default function WalletLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  return <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />;
}
