import { Stack } from 'expo-router/js-stack';

import { pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';
import { useTheme } from '@/ui/theme';

/**
 * The TRIPS tab: the trip list (or the one trip's hub), and each trip's hub and day-of screens
 * pushed inside the tab so the tab bar stays. The premium UI uses a native stack (large title, glass
 * toolbar) and opens a trip's hub on the root stack (`/hub/<tripId>`), so the tab bar leaves.
 */
export default function TripsLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  if (usePremiumUi()) return <PremiumStack />;
  return <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />;
}
