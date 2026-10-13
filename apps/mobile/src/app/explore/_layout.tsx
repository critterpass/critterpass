import { Stack } from 'expo-router/js-stack';

import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';
import { sheetRouteOptions } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/states/SessionGate';

/** Explore pages pushed from Home, a trip or a link (screens owned by the explore area); session-only. */
export default function ExploreLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  if (usePremiumUi()) {
    // The premium UI: a native stack, so the place page's push and edge swipe are native, and
    // "Why am I seeing this?" is a native form sheet as tall as its words.
    return (
      <SessionGate>
        <PremiumStack>
          {sheetScreens('explore').map((name) => (
            <PremiumStackScreen key={name} name={name} options={sheetRouteOptions('fit')} />
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
