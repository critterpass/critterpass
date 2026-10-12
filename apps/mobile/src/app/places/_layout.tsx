import { Stack } from 'expo-router/js-stack';

import { deviceVoteServices } from '@/features/vote/data/device-vote-services';
import { VoteServicesProvider } from '@/features/vote/data/vote-services';
import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { FULL_SCREEN_ROUTE_OPTIONS } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/states/SessionGate';
import { useTheme } from '@/ui/theme';

/** Places: the guest guide's place page is a pushed page; the search sheet rises over its opener. */
export default function PlacesLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const premium = usePremiumUi();
  return (
    <VoteServicesProvider services={deviceVoteServices}>
      <SessionGate>
        {premium ? (
          <PremiumStack>
            <PremiumStackScreen name="search" options={FULL_SCREEN_ROUTE_OPTIONS} />
          </PremiumStack>
        ) : (
          <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
            {sheetScreens('places').map((name) => (
              <Stack.Screen key={name} name={name} options={modalGroupOptions()} />
            ))}
          </Stack>
        )}
      </SessionGate>
    </VoteServicesProvider>
  );
}
