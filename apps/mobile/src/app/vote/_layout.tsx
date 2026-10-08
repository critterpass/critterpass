import { Stack } from 'expo-router/js-stack';

import { deviceVoteServices } from '@/features/vote/data/device-vote-services';
import { VoteServicesProvider } from '@/features/vote/data/vote-services';
import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { SessionGate } from '@/ui/states/SessionGate';
import { useTheme } from '@/ui/theme';

/**
 * The vote area. The showdown is a pushed page with its way back; the new-poll and pitch sheets
 * rise over the screen that opened them, and the winner reveal appears at once (`sheet-routes.ts`).
 */
export default function VoteLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  return (
    <VoteServicesProvider services={deviceVoteServices}>
      <SessionGate>
        <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
          {sheetScreens('vote').map((name) => (
            <Stack.Screen key={name} name={name} options={modalGroupOptions()} />
          ))}
        </Stack>
      </SessionGate>
    </VoteServicesProvider>
  );
}
