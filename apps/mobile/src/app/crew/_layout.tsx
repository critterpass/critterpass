import { Stack } from 'expo-router/js-stack';

import { deviceCrewServices } from '@/features/crew/crews-sheet/device-services';
import { CrewServicesProvider } from '@/features/crew/crews-sheet/crew-services';
import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { SessionGate } from '@/ui/states/SessionGate';
import { useTheme } from '@/ui/theme';

/**
 * The crew area. Its pages (chat, settings, the invite composer, start a crew) are pushed like any
 * other page; only the crews sheet rises over the screen that opened it.
 */
export default function CrewLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  return (
    <CrewServicesProvider services={deviceCrewServices()}>
      <SessionGate>
        <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
          {sheetScreens('crew').map((name) => (
            <Stack.Screen key={name} name={name} options={modalGroupOptions()} />
          ))}
        </Stack>
      </SessionGate>
    </CrewServicesProvider>
  );
}
