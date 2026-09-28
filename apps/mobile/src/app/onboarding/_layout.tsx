import { Stack } from 'expo-router/js-stack';

import { deviceOnboardingServices } from '@/features/onboarding/device-services';
import { OnboardingServicesProvider } from '@/features/onboarding/services';

import { getSubjectLift } from '../../../modules/cp-subject-lift';

/** The pass flow (3a-1 … 3a-9): full-screen pages, no headers; the pages carry their own chrome. */
export default function OnboardingLayout() {
  return (
    <OnboardingServicesProvider services={deviceOnboardingServices(getSubjectLift())}>
      <Stack screenOptions={{ headerShown: false }} />
    </OnboardingServicesProvider>
  );
}
