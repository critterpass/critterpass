import { Stack } from 'expo-router/js-stack';

import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';
import { SessionGate } from '@/ui/states/SessionGate';

/** Explore pages pushed from Home, a trip or a link (screens owned by the explore area); session-only. */
export default function ExploreLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();

  return (
    <SessionGate>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
        {/* A sheet over the page that opened it: it animates itself. */}
        <Stack.Screen name="why-sponsored" options={modalGroupOptions()} />
      </Stack>
    </SessionGate>
  );
}
