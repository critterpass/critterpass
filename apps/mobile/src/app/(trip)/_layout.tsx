import { Stack } from 'expo-router/js-stack';

import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';
import { FULL_SCREEN_ROUTE_OPTIONS } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { SELF_ANIMATED_SHEET } from '@/ui/premium/shell/navigation/premium-root-stack';
import { PremiumGroupErrorBoundary } from '@/features/home/premium/recovery/premium-error-boundary';
import { SessionGate } from '@/ui/states/SessionGate';

/* eslint-disable lingui/no-unlocalized-strings -- route names, never copy. */
const FULL_SCREENS = [
  'proposal/[id]/board',
  'proposal/[id]/trailer',
  'album/[tripId]/[photoId]',
  'recap/[tripId]/story',
] as const;
/* eslint-enable lingui/no-unlocalized-strings */

// A trip screen that fails is contained here: the tabs and the pages under it stay as they were.
export { PremiumGroupErrorBoundary as ErrorBoundary };

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
          {/* Covers the app with their ✕ (or their own way out): the proposal landing, its
              trailer, a photo and the recap story. */}
          {FULL_SCREENS.map((name) => (
            <PremiumStackScreen key={name} name={name} options={FULL_SCREEN_ROUTE_OPTIONS} />
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
