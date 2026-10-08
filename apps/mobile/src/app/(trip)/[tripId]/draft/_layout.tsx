import { Stack } from 'expo-router/js-stack';

import { deviceDraftServices, DraftServicesProvider } from '@/features/plan/draft';
import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui/theme';

/** The private draft: drafting, the draft, a redraft; change-a-day and the last redraft as sheets. */
export default function DraftLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  return (
    <DraftServicesProvider services={deviceDraftServices}>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
        {/* eslint-disable-next-line lingui/no-unlocalized-strings -- a navigator's path, never copy. */}
        {sheetScreens('(trip)/[tripId]/draft').map((name) => (
          <Stack.Screen key={name} name={name} options={modalGroupOptions()} />
        ))}
      </Stack>
    </DraftServicesProvider>
  );
}
