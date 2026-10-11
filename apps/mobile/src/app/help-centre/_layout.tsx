import { Stack } from 'expo-router/js-stack';

import { pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';
import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/states/SessionGate';

/** The help centre and feedback, pushed from Settings; session-only. */
export default function HelpCentreLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const premium = usePremiumUi();

  return (
    <SessionGate>
      {premium ? (
        <PremiumStack />
      ) : (
        <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
      )}
    </SessionGate>
  );
}
