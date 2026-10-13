/* eslint-disable lingui/no-unlocalized-strings -- route names, never copy. */
import { Stack } from 'expo-router/js-stack';

import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { FULL_SCREEN_ROUTE_OPTIONS, sheetRouteOptions } from '@/ui/premium/shell';
import { PremiumGroupErrorBoundary } from '@/features/home/premium/recovery/premium-error-boundary';
import { SessionGate } from '@/ui/states/SessionGate';

const FULL_SCREENS = [
  'proposal/[id]/board',
  'proposal/[id]/trailer',
  'album/[tripId]/[photoId]',
  'recap/[tripId]/story',
  'encounter/[id]',
] as const;

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
    // The premium UI: a native stack, so the trip hub's zoom and native sheets work from here. The
    // lock-screen offer is a native form sheet over the crew map that opens it.
    return (
      <SessionGate>
        <PremiumStack>
          {sheetScreens('(trip)').map((name) => (
            <PremiumStackScreen key={name} name={name} options={sheetRouteOptions('fit')} />
          ))}
          {/* A crew SOS takes the whole screen (6.17), and so does sending one. */}
          <PremiumStackScreen name="sos/[id]" options={FULL_SCREEN_ROUTE_OPTIONS} />
          <PremiumStackScreen name="sos/send" options={FULL_SCREEN_ROUTE_OPTIONS} />
          {/* Covers the app with their ✕ (or their own way out): the proposal landing, its
              trailer, a photo, the recap story and a critter encounter. */}
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
        {sheetScreens('(trip)').map((name) => (
          <Stack.Screen key={name} name={name} options={modalGroupOptions()} />
        ))}
      </Stack>
    </SessionGate>
  );
}
