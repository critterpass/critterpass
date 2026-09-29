/* eslint-disable lingui/no-unlocalized-strings -- route names, never copy. */
import { Stack } from 'expo-router/js-stack';

import { deviceSetupServices } from '@/features/setup/data/device-services';
import { SetupServicesProvider } from '@/features/setup/data/services';
import { modalGroupOptions } from '@/lib/navigation/transitions';

/** Trip setup: the four steps, and the add-a-must-do and answer-an-ask sheets over them. */
export default function SetupLayout() {
  return (
    <SetupServicesProvider services={deviceSetupServices}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="must-dos/add" options={modalGroupOptions()} />
        <Stack.Screen name="ask/[askId]" options={modalGroupOptions()} />
      </Stack>
    </SetupServicesProvider>
  );
}
