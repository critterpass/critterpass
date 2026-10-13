import { deviceInviteServices } from '@/features/onboarding/invited/device-services';
import { InviteServicesProvider } from '@/features/onboarding/invited/invite-services';
import { PremiumStack } from '@/ui/premium/shell';

/** The invited fast path: full-screen pages carrying their own chrome. */
export default function InviteLayout() {
  return (
    <InviteServicesProvider services={deviceInviteServices()}>
      <PremiumStack />
    </InviteServicesProvider>
  );
}
