import { Stack } from 'expo-router/js-stack';

import { deviceDraftServices, DraftServicesProvider } from '@/features/plan/draft';
import { modalGroupOptions } from '@/lib/navigation/transitions';

/** The private draft: drafting, the draft, a redraft; change-a-day and the last redraft as sheets. */
export default function DraftLayout() {
  return (
    <DraftServicesProvider services={deviceDraftServices}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="change-day" options={modalGroupOptions()} />
        <Stack.Screen name="last-redraft" options={modalGroupOptions()} />
      </Stack>
    </DraftServicesProvider>
  );
}
