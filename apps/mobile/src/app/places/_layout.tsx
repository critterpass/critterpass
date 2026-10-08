import { Stack } from 'expo-router/js-stack';

import { deviceVoteServices } from '@/features/vote/data/device-vote-services';
import { VoteServicesProvider } from '@/features/vote/data/vote-services';
import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { SessionGate } from '@/ui/states/SessionGate';
import { useTheme } from '@/ui/theme';

/** Places: the guest guide's place page is a pushed page; the search sheet rises over its opener. */
export default function PlacesLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  return (
    <VoteServicesProvider services={deviceVoteServices}>
      <SessionGate>
        <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
          {sheetScreens('places').map((name) => (
            <Stack.Screen key={name} name={name} options={modalGroupOptions()} />
          ))}
        </Stack>
      </SessionGate>
    </VoteServicesProvider>
  );
}
