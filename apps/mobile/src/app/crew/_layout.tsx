import { Stack } from 'expo-router/js-stack';

import { deviceCrewServices } from '@/features/crew/crews-sheet/device-services';
import { CrewServicesProvider } from '@/features/crew/crews-sheet/crew-services';
import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { ToastHost } from '@/ui/premium';
import { sheetRouteOptions } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { SELF_ANIMATED_SHEET } from '@/ui/premium/shell/navigation/premium-root-stack';
import { SessionGate } from '@/ui/states/SessionGate';
import { useTheme } from '@/ui/theme';

/* eslint-disable lingui/no-unlocalized-strings -- route names, never copy. */

/** Starting a crew covers the app and closes with its ✕ (3.08), so it rises rather than slides. */
const START_CREW = { presentation: 'fullScreenModal' } as const;

/**
 * The crew area. Its pages (chat, settings, the invite composer, start a crew) are pushed like any
 * other page; only the crews sheet rises over the screen that opened it. The premium UI runs a
 * native stack: starting a crew is a page with a ✕ (it is often the stack's first screen, which
 * can't present as a sheet), inviting is a form sheet, a member opens as a sheet sized to its
 * content, and the area keeps its own toast stack for Undo and "Copied".
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
            <PremiumStack>
              {sheetScreens('crew').map((name) => (
                <PremiumStackScreen key={name} name={name} options={SELF_ANIMATED_SHEET} />
              ))}
              <PremiumStackScreen name="new" options={START_CREW} />
              <PremiumStackScreen name="[crewId]/invite" options={sheetRouteOptions('full')} />
              <PremiumStackScreen name="[crewId]/member/[uid]" options={sheetRouteOptions('fit')} />
            </PremiumStack>
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
