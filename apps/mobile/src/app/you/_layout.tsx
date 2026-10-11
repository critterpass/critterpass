import { getAlarmPort } from '../../../modules/cp-alarm';

import { Stack } from 'expo-router/js-stack';

import { provideAlarmCanceller } from '@/features/you/account/device-wipe';
import { pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';
import { sheetRouteOptions } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/states/SessionGate';

// Signing out and deleting the account end in a cleared phone, leave-by alarms included.
provideAlarmCanceller(getAlarmPort());

const APPEARANCE_SHEET = sheetRouteOptions('half');

/**
 * The profile and its settings, pushed over the tabs from Home's header; session-only. The premium
 * UI pushes them on a native stack and shows Appearance as a half-height sheet.
 */
export default function YouLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const premium = usePremiumUi();

  return (
    <SessionGate>
      {premium ? (
        <PremiumStack>
          <PremiumStackScreen name="appearance" options={APPEARANCE_SHEET} />
        </PremiumStack>
      ) : (
        <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
      )}
    </SessionGate>
  );
}
