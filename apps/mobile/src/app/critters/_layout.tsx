import { Stack } from 'expo-router/js-stack';

import { pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';
import { PremiumStack } from '@/ui/premium/shell';
import { SessionGate } from '@/ui/states/SessionGate';

/** Critterdex pages pushed from the PASS tab (screens owned by the critters area); session-only. */
export default function CrittersLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();

  if (usePremiumUi()) {
    // A native stack, so the legendary calendar's toolbar and the glass back work here.
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
