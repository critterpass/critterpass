import { Stack } from 'expo-router/js-stack';

import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { SessionGate } from '@/ui/states/SessionGate';
import { useTheme } from '@/ui/theme';

/** A trip's year-later memory, opened by its notification; session-only. */
export default function MemoryLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  return (
    <SessionGate>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
    </SessionGate>
  );
}
