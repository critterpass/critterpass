import { Stack } from 'expo-router/js-stack';

import { registerMoneyScreens } from '@/features/money/routes';
import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui/theme';

registerMoneyScreens();

/** Money's pushed screens (over the tabs): add, scan, settle up, history and the details. */
export default function MoneyLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  return <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />;
}
