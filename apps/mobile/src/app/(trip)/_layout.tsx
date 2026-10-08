import { Stack } from 'expo-router/js-stack';

import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';
import { RootErrorBoundary } from '@/ui/shell/RootErrorBoundary';
import { SessionGate } from '@/ui/states/SessionGate';

// A trip screen that fails is contained here: the tabs and the pages under it stay as they were.
export { RootErrorBoundary as ErrorBoundary };

/**
 * Trip-day stack (screens owned by the trip area); session-only. Its layouts and screens read the
 * local database as they mount, so nothing under it renders before the session is up.
 */
export default function TripLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();

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
