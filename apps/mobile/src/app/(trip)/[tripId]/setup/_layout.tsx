/* eslint-disable lingui/no-unlocalized-strings -- route names, never copy. */

import { DeviceCalendarProvider } from '@/features/setup/calendar/device-calendar';
import { deviceSetupServices } from '@/features/setup/data/device-services';
import { SetupServicesProvider } from '@/features/setup/data/services';
import { sheetRouteOptions } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';

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

/** Trip setup: the steps, and the add-a-must-do and answer-an-ask sheets over them. */
export default function SetupLayout() {
  return (
    <SetupServicesProvider services={deviceSetupServices}>
      <DeviceCalendarProvider calendar={deviceCalendar}>
        <PremiumStack>
          {/* Adding a must-do and the guide's ask are native form sheets. */}
          <PremiumStackScreen name="must-dos/add" options={sheetRouteOptions('full')} />
          <PremiumStackScreen name="ask/[askId]" options={sheetRouteOptions('fit')} />
        </PremiumStack>
      </DeviceCalendarProvider>
    </SetupServicesProvider>
  );
}
