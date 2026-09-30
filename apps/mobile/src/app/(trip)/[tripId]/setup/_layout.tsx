/* eslint-disable lingui/no-unlocalized-strings -- route names, never copy. */
import { Stack } from 'expo-router/js-stack';

import { DeviceCalendarProvider } from '@/features/setup/calendar/device-calendar';
import { deviceSetupServices } from '@/features/setup/data/device-services';
import { SetupServicesProvider } from '@/features/setup/data/services';
import { modalGroupOptions } from '@/lib/navigation/transitions';

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
  return (
    <SetupServicesProvider services={deviceSetupServices}>
      <DeviceCalendarProvider calendar={deviceCalendar}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="must-dos/add" options={modalGroupOptions()} />
          <Stack.Screen name="ask/[askId]" options={modalGroupOptions()} />
        </Stack>
      </DeviceCalendarProvider>
    </SetupServicesProvider>
  );
}
