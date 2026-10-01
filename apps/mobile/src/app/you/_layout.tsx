import { getAlarmPort } from '../../../modules/cp-alarm';

import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/js-stack';

import { provideAlarmCanceller } from '@/features/you/account/device-wipe';
import { useGateDecision } from '@/lib/navigation/gates';
import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';

// Signing out and deleting the account end in a cleared phone, leave-by alarms included.
provideAlarmCanceller(getAlarmPort());

/** The profile and its settings, pushed over the tabs from Home's header; session-only. */
export default function YouLayout() {
  const decision = useGateDecision();
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();

  if (decision.kind === 'wait') return null;
  if (decision.kind === 'redirect') return <Redirect href={decision.href} />;

  return <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />;
}
