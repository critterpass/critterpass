import { deviceOnboardingServices } from '@/features/onboarding/device-services';
import { OnboardingServicesProvider } from '@/features/onboarding/services';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell';

import { getOcr } from '../../../modules/cp-ocr';
import { getSubjectLift } from '../../../modules/cp-subject-lift';

/**
 * The pass flow: full-screen pages on the native stack, no headers; the pages carry their own
 * chrome. From the issued pass on there is no way back into the pages that made it: the swipe is
 * off there, and the page takes Android's back button. The save sheet draws over the issued pass.
 */
export default function OnboardingLayout() {
  return (
    <OnboardingServicesProvider services={deviceOnboardingServices(getSubjectLift(), getOcr())}>
      <PremiumStack>
        <PremiumStackScreen name="issued" options={{ animation: 'fade', gestureEnabled: false }} />
        <PremiumStackScreen name="save" options={{ animation: 'fade', gestureEnabled: false }} />
      </PremiumStack>
    </OnboardingServicesProvider>
  );
}
