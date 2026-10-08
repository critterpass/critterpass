import { Stack } from 'expo-router/js-stack';

import { deviceOnboardingServices } from '@/features/onboarding/device-services';
import { OnboardingServicesProvider } from '@/features/onboarding/services';

import { getSubjectLift } from '../../../modules/cp-subject-lift';

/**
 * The pass flow (3a-1 … 3a-9): full-screen pages, no headers; the pages carry their own chrome.
 * Page one fades in over the splash's opened passport (its pass card lands where the page grew
 * to), rather than sliding in over it. From the issued pass on there is no way back into the pages
 * that made it: the swipe is off there, and the page takes Android's back button.
 */
export default function OnboardingLayout() {
  return (
    <OnboardingServicesProvider services={deviceOnboardingServices(getSubjectLift())}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="name" options={{ animation: 'fade' }} />
        <Stack.Screen name="issued" options={{ gestureEnabled: false }} />
      </Stack>
    </OnboardingServicesProvider>
  );
}
