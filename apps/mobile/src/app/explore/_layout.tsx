import { Stack } from 'expo-router/js-stack';

import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { SELF_ANIMATED_SHEET } from '@/ui/premium/shell/navigation/premium-root-stack';
import { SessionGate } from '@/ui/states/SessionGate';

/** Explore pages pushed from Home, a trip or a link (screens owned by the explore area); session-only. */
export default function ExploreLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  if (usePremiumUi()) {
    // The premium UI: a native stack, so the place page's push and edge swipe are native.
    return (
      <SessionGate>
        <PremiumStack>
          {sheetScreens('explore').map((name) => (
            <PremiumStackScreen key={name} name={name} options={SELF_ANIMATED_SHEET} />
          ))}
        </PremiumStack>
      </SessionGate>
    );
  }

  return (
    <SessionGate>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
        {/* "Why sponsored" is a sheet over the page that opened it: it animates itself. */}
        {sheetScreens('explore').map((name) => (
          <Stack.Screen key={name} name={name} options={modalGroupOptions()} />
        ))}
      </Stack>
    </SessionGate>
  );
}
