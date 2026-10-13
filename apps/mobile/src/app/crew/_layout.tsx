import { Stack } from 'expo-router/js-stack';

import { deviceCrewServices } from '@/features/crew/crews-sheet/device-services';
import { CrewServicesProvider } from '@/features/crew/crews-sheet/crew-services';
import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { ToastHost } from '@/ui/premium';
import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/states/SessionGate';
import { useTheme } from '@/ui/theme';

/**
 * The crew area. Its pages (chat, settings, the invite composer, start a crew) are pushed like any
 * other page; only the crews sheet rises over the screen that opened it. The premium UI runs a
 * native stack that presents each screen the way `lib/navigation/presentation.ts` lists it
 * (starting a crew a tall sheet with its ✕, inviting a form sheet, a member a sheet sized to its
 * content, the crews sheet drawing itself), and the area keeps its own toast stack for Undo and
 * "Copied".
 */
export default function CrewLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const premium = usePremiumUi();
  return (
    <CrewServicesProvider services={deviceCrewServices()}>
      <SessionGate>
        {premium ? (
          <ToastHost bottomOffset={0}>
            <PremiumStack navigator="crew" />
          </ToastHost>
        ) : (
          <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
            {sheetScreens('crew').map((name) => (
              <Stack.Screen key={name} name={name} options={modalGroupOptions()} />
            ))}
          </Stack>
        )}
      </SessionGate>
    </CrewServicesProvider>
  );
}
