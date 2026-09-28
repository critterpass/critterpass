import { Stack } from 'expo-router/js-stack';

import { deviceInviteServices } from '@/features/onboarding/invited/device-services';
import { InviteServicesProvider } from '@/features/onboarding/invited/invite-services';

/** The invited fast path (3a-10 … 3a-13): full-screen pages carrying their own chrome. */
export default function InviteLayout() {
  return (
    <InviteServicesProvider services={deviceInviteServices()}>
      <Stack screenOptions={{ headerShown: false }} />
    </InviteServicesProvider>
  );
}
