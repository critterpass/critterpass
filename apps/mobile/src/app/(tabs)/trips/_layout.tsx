import { Stack } from 'expo-router/js-stack';

import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui/theme';

/**
 * The TRIPS tab: the trip list (or the one trip's hub), and each trip's hub and day-of screens
 * pushed inside the tab so the tab bar stays.
 */
export default function TripsLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  return <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />;
}
