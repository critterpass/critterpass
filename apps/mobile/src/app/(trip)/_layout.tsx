import { Stack } from 'expo-router/js-stack';

import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { SELF_ANIMATED_SHEET } from '@/ui/premium/shell/navigation/premium-root-stack';
import { GroupErrorBoundary } from '@/ui/shell/RootErrorBoundary';
import { SessionGate } from '@/ui/states/SessionGate';

// A trip screen that fails is contained here: the tabs and the pages under it stay as they were.
export { GroupErrorBoundary as ErrorBoundary };

/**
 * Trip-day stack (screens owned by the trip area); session-only. Its layouts and screens read the
 * local database as they mount, so nothing under it renders before the session is up.
 */
export default function TripLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();

  if (usePremiumUi()) {
    // The premium UI: a native stack, so the trip hub's zoom and native sheets work from here.
    return (
      <SessionGate>
        <PremiumStack>
          {/* eslint-disable-next-line lingui/no-unlocalized-strings -- a navigator's path, never copy. */}
          {sheetScreens('(trip)').map((name) => (
            <PremiumStackScreen key={name} name={name} options={SELF_ANIMATED_SHEET} />
          ))}
        </PremiumStack>
      </SessionGate>
    );
  }
  return (
    <SessionGate>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
        {/* The lock-screen offer rises over the screen that opened it. */}
        {/* eslint-disable-next-line lingui/no-unlocalized-strings -- a navigator's path, never copy. */}
        {sheetScreens('(trip)').map((name) => (
          <Stack.Screen key={name} name={name} options={modalGroupOptions()} />
        ))}
      </Stack>
    </SessionGate>
  );
}
