import { Stack } from 'expo-router/js-stack';

import { deviceInviteServices } from '@/features/onboarding/invited/device-services';
import { InviteServicesProvider } from '@/features/onboarding/invited/invite-services';
import { usePremiumUi } from '@/lib/premium-ui';
import { PremiumStack } from '@/ui/premium/shell';

/** The invited fast path (3a-10 … 3a-13): full-screen pages carrying their own chrome. */
export default function InviteLayout() {
  const premium = usePremiumUi();
  return (
    <InviteServicesProvider services={deviceInviteServices()}>
      {premium ? <PremiumStack /> : <Stack screenOptions={{ headerShown: false }} />}
    </InviteServicesProvider>
  );
}
