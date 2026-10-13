import { Stack } from 'expo-router/js-stack';

import { pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { PremiumStack } from '@/ui/premium/shell';
import { SessionGate } from '@/ui/states/SessionGate';
import { useTheme } from '@/ui/theme';

/** A trip's year-later memory, opened by its notification; session-only. */
export default function MemoryLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  if (usePremiumUi()) {
    // A native stack, so the memory's ✕ and the pages it opens move natively.
    return (
      <SessionGate>
        <PremiumStack />
      </SessionGate>
    );
  }
  return (
    <SessionGate>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
    </SessionGate>
  );
}
