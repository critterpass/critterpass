import { getAlarmPort } from '../../../modules/cp-alarm';

import { Stack } from 'expo-router/js-stack';

import { provideAlarmCanceller } from '@/features/you/account/device-wipe';
import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';
import { SessionGate } from '@/ui/states/SessionGate';

// Signing out and deleting the account end in a cleared phone, leave-by alarms included.
provideAlarmCanceller(getAlarmPort());

/** The profile and its settings, pushed over the tabs from Home's header; session-only. */
export default function YouLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();

  return (
    <SessionGate>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
    </SessionGate>
  );
}
