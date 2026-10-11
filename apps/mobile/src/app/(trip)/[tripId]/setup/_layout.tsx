/* eslint-disable lingui/no-unlocalized-strings -- route names, never copy. */
import { Stack } from 'expo-router/js-stack';

import { DeviceCalendarProvider } from '@/features/setup/calendar/device-calendar';
import { deviceSetupServices } from '@/features/setup/data/device-services';
import { SetupServicesProvider } from '@/features/setup/data/services';
import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { SELF_ANIMATED_SHEET } from '@/ui/premium/shell/navigation/premium-root-stack';
import { useTheme } from '@/ui/theme';

import {
  hasCalendarAccess,
  isDeviceCalendarAvailable,
  readBusyDays,
} from '../../../../../modules/cp-calendar';

const deviceCalendar = {
  isAvailable: isDeviceCalendarAvailable,
  hasAccess: hasCalendarAccess,
  readBusyDays,
};

/** Trip setup: the four steps, and the add-a-must-do and answer-an-ask sheets over them. */
export default function SetupLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const premium = usePremiumUi();
  return (
    <SetupServicesProvider services={deviceSetupServices}>
      <DeviceCalendarProvider calendar={deviceCalendar}>
        {premium ? (
          <PremiumStack>
            {sheetScreens('(trip)/[tripId]/setup').map((name) => (
              <PremiumStackScreen key={name} name={name} options={SELF_ANIMATED_SHEET} />
            ))}
          </PremiumStack>
        ) : (
          <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
            {sheetScreens('(trip)/[tripId]/setup').map((name) => (
              <Stack.Screen key={name} name={name} options={modalGroupOptions()} />
            ))}
          </Stack>
        )}
      </DeviceCalendarProvider>
    </SetupServicesProvider>
  );
}
